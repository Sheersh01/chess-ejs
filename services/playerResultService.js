const User = require("../models/User");
const logger = require("../config/logger");
const { isDbReady } = require("../config/database");
const gameManager = require("../game/gameManager");

const RATING_FLOOR = 100;
const PROVISIONAL_GAMES = 30;
const HISTORY_LIMIT = 20;

const kFactor = (gamesPlayed = 0) => (gamesPlayed < PROVISIONAL_GAMES ? 40 : 20);

/** Rating change for a player rated `ra` scoring `score` (1, 0.5, 0) against `rb`. */
const computeElo = (ra, rb, score, k) => {
  const expected = 1 / (1 + Math.pow(10, (rb - ra) / 400));
  return Math.round(k * (score - expected));
};

const outcomeFor = (result, color) => {
  if (result === "draw") return "draw";
  return result === color ? "win" : "loss";
};

const SCORE = { win: 1, draw: 0.5, loss: 0 };
const COUNTER_FIELD = { win: "wins", draw: "draws", loss: "losses" };

const opponentName = (game, color) => {
  const other = color === "white" ? "black" : "white";
  const meta = game.playerMeta?.[other] || {};
  if (meta.displayName || meta.username) return meta.displayName || meta.username;
  return gameManager.isBotId(String(game.userIds[other])) ? "Chess Bot" : "Opponent";
};

const buildUpdatePipeline = ({ entry, rated, outcome, delta }) => {
  const set = {
    // $literal keeps user-supplied strings (e.g. "$name") from being read as field paths.
    gameHistory: {
      $slice: [
        { $concatArrays: [[{ $literal: entry }], { $ifNull: ["$gameHistory", []] }] },
        HISTORY_LIMIT,
      ],
    },
    lastActive: "$$NOW",
  };

  if (rated) {
    const counter = COUNTER_FIELD[outcome];
    set.rating = { $max: [RATING_FLOOR, { $add: ["$rating", delta] }] };
    set.gamesPlayed = { $add: [{ $ifNull: ["$gamesPlayed", 0] }, 1] };
    set[counter] = { $add: [{ $ifNull: [`$${counter}`, 0] }, 1] };
    set.winStreak =
      outcome === "win" ? { $add: [{ $ifNull: ["$winStreak", 0] }, 1] } : 0;
  }

  return [
    { $set: set },
    {
      $set: {
        bestWinStreak: {
          $max: [{ $ifNull: ["$bestWinStreak", 0] }, { $ifNull: ["$winStreak", 0] }],
        },
      },
    },
  ];
};

const notifyPlayer = async (io, game, color, userId, delta) => {
  const fresh = await User.findById(userId)
    .select("rating gamesPlayed wins losses draws")
    .lean();
  if (!fresh) return;

  const socket = io?.sockets?.sockets?.get(game.players[color]);
  if (socket?.user) {
    socket.user.rating = fresh.rating;
  }
  io?.to(game.players[color]).emit("ratingUpdate", {
    rating: fresh.rating,
    delta,
    gamesPlayed: fresh.gamesPlayed,
    wins: fresh.wins,
    losses: fresh.losses,
    draws: fresh.draws,
  });
};

/**
 * Persist a finished game's result for each registered player: rating (rated games
 * only), counters and a history entry, applied as one atomic update per user.
 * Both rating changes are computed from the pre-game ratings.
 */
const recordResult = async (game, result, reason, io) => {
  if (!result || !isDbReady()) {
    return { rated: false };
  }

  const colors = ["white", "black"].filter((color) =>
    gameManager.isRegisteredUserId(game.userIds[color]),
  );
  if (colors.length === 0) {
    return { rated: false };
  }

  const users = await User.find({ _id: { $in: colors.map((c) => game.userIds[c]) } })
    .select("rating gamesPlayed")
    .lean();
  const byId = new Map(users.map((user) => [String(user._id), user]));
  const white = byId.get(String(game.userIds.white));
  const black = byId.get(String(game.userIds.black));
  const rated = Boolean(game.rated && white && black);

  const summary = { rated };
  const deltas = {};
  if (rated) {
    const whiteOutcome = outcomeFor(result, "white");
    deltas.white = computeElo(
      white.rating,
      black.rating,
      SCORE[whiteOutcome],
      kFactor(white.gamesPlayed),
    );
    deltas.black = computeElo(
      black.rating,
      white.rating,
      SCORE[outcomeFor(result, "black")],
      kFactor(black.gamesPlayed),
    );
  }

  await Promise.all(
    colors.map(async (color) => {
      const user = byId.get(String(game.userIds[color]));
      if (!user) return;

      const outcome = outcomeFor(result, color);
      const delta = rated ? deltas[color] : 0;
      const before = user.rating;
      const after = rated ? Math.max(RATING_FLOOR, before + delta) : before;
      summary[color] = { before, after, delta };

      const entry = {
        gameId: game.id,
        opponent: String(opponentName(game, color)).slice(0, 40),
        mode: game.isBotGame ? "bot" : "online",
        color,
        result: outcome,
        reason: String(reason || "").slice(0, 120),
        moves: game.moveHistory.length,
        rated,
        ratingBefore: before,
        ratingAfter: after,
        playedAt: new Date(),
      };

      await User.updateOne(
        { _id: user._id },
        buildUpdatePipeline({ entry, rated, outcome, delta }),
      );

      if (rated) {
        await notifyPlayer(io, game, color, user._id, delta).catch((err) =>
          logger.warn({ err }, "Failed to send rating update"),
        );
      }
    }),
  );

  return summary;
};

module.exports = { computeElo, kFactor, recordResult, RATING_FLOOR };
