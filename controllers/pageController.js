const User = require("../models/User");
const Game = require("../models/Game");
const { isDbReady } = require("../config/database");

const LEADERBOARD_SIZE = 50;
const GAMES_PAGE_SIZE = 20;

const currentUserId = (req) => String(req.user._id || req.user.id);

const describeResult = (game, userId) => {
  if (!game.result) return { label: "Aborted", tone: "neutral" };
  if (game.result === "draw") return { label: "Draw", tone: "draw" };
  const myColor = game.whiteUserId === userId ? "white" : "black";
  return game.result === myColor
    ? { label: "Win", tone: "win" }
    : { label: "Loss", tone: "loss" };
};

exports.leaderboard = async (req, res, next) => {
  try {
    if (!isDbReady()) {
      return res.render("leaderboard", {
        players: [],
        myRank: null,
        unavailable: true,
      });
    }

    const players = await User.find({ gamesPlayed: { $gt: 0 } })
      .select("username displayName rating wins losses draws gamesPlayed")
      .sort({ rating: -1, gamesPlayed: -1 })
      .limit(LEADERBOARD_SIZE)
      .lean();

    let myRank = null;
    if (!req.user.isGuest && req.user.gamesPlayed > 0) {
      const ahead = await User.countDocuments({
        gamesPlayed: { $gt: 0 },
        rating: { $gt: req.user.rating },
      });
      myRank = ahead + 1;
    }

    return res.render("leaderboard", { players, myRank, unavailable: false });
  } catch (error) {
    return next(error);
  }
};

exports.gamesList = async (req, res, next) => {
  try {
    const userId = currentUserId(req);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

    if (!isDbReady()) {
      return res.render("games", { games: [], page: 1, pages: 1, unavailable: true });
    }

    const filter = {
      status: { $in: ["completed", "abandoned"] },
      $or: [{ whiteUserId: userId }, { blackUserId: userId }],
    };
    const [games, total] = await Promise.all([
      Game.find(filter)
        .select(
          "gameId whiteUserId blackUserId whiteUsername blackUsername mode rated timeControl result reason moveCount finishedAt status",
        )
        .sort({ finishedAt: -1 })
        .skip((page - 1) * GAMES_PAGE_SIZE)
        .limit(GAMES_PAGE_SIZE)
        .lean(),
      Game.countDocuments(filter),
    ]);

    const rows = games.map((game) => ({
      ...game,
      myColor: game.whiteUserId === userId ? "white" : "black",
      opponent: game.whiteUserId === userId ? game.blackUsername : game.whiteUsername,
      outcome: describeResult(game, userId),
    }));

    return res.render("games", {
      games: rows,
      page,
      pages: Math.max(1, Math.ceil(total / GAMES_PAGE_SIZE)),
      unavailable: false,
    });
  } catch (error) {
    return next(error);
  }
};

exports.replay = async (req, res, next) => {
  try {
    if (!isDbReady()) return res.status(503).send("Game history is unavailable");

    const game = await Game.findOne({ gameId: String(req.params.id) }).lean();
    if (!game) return res.status(404).send("Game not found");

    const userId = currentUserId(req);
    if (game.whiteUserId !== userId && game.blackUserId !== userId) {
      return res.status(403).send("You can only review your own games");
    }

    return res.render("replay", {
      game,
      myColor: game.whiteUserId === userId ? "white" : "black",
      outcome: describeResult(game, userId),
      // Serialized into a data attribute (EJS escapes it) for the replay script.
      replayData: JSON.stringify({
        pgn: game.pgn || "",
        white: game.whiteUsername,
        black: game.blackUsername,
        orientation: game.whiteUserId === userId ? "white" : "black",
      }),
    });
  } catch (error) {
    return next(error);
  }
};
