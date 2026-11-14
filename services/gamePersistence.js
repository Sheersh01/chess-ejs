const Game = require("../models/Game");
const logger = require("../config/logger");
const { isDbReady } = require("../config/database");
const timerManager = require("../game/timerManager");

const getClocks = (game) => ({
  whiteMs: Math.round(timerManager.getRemainingMs(game, "white")),
  blackMs: Math.round(timerManager.getRemainingMs(game, "black")),
});

const createGameRecord = async (game) => {
  if (!isDbReady()) return;
  try {
    const whiteMeta = game.playerMeta?.white || {};
    const blackMeta = game.playerMeta?.black || {};

    await Game.create({
      gameId: game.id,
      whiteUserId: String(game.userIds.white),
      blackUserId: String(game.userIds.black),
      whiteUsername: whiteMeta.displayName || whiteMeta.username || "White",
      blackUsername: blackMeta.displayName || blackMeta.username || "Black",
      mode: game.isBotGame ? "bot" : "online",
      rated: game.rated,
      timeControl: game.clock.timeControl,
      status: "active",
      fen: game.chess.fen(),
      pgn: game.chess.pgn(),
      clocks: getClocks(game),
      whiteRatingBefore: game.initialRatings?.white,
      blackRatingBefore: game.initialRatings?.black,
      startedAt: new Date(),
    });
  } catch (error) {
    logger.warn({ err: error, gameId: game.id }, "Failed to create game record");
  }
};

const updateGameRecord = async (game) => {
  if (!isDbReady()) return;
  const moveCount = game.moveHistory.length;
  try {
    // The moveCount guard stops an older, slower write from overwriting a newer one.
    await Game.updateOne(
      { gameId: game.id, status: "active", moveCount: { $lt: moveCount } },
      {
        $set: {
          fen: game.chess.fen(),
          pgn: game.chess.pgn(),
          moveCount,
          clocks: getClocks(game),
        },
      },
    );
  } catch (error) {
    logger.warn({ err: error, gameId: game.id }, "Failed to update game record");
  }
};

const finalizeGameRecord = async (game, { result, reason, status, ratings }) => {
  if (!isDbReady()) return;
  try {
    const update = {
      status,
      result: result || null,
      reason: reason || "",
      rated: Boolean(ratings?.rated),
      fen: game.chess.fen(),
      pgn: game.chess.pgn(),
      moveCount: game.moveHistory.length,
      clocks: getClocks(game),
      finishedAt: new Date(),
    };
    if (ratings?.white?.after !== undefined)
      update.whiteRatingAfter = ratings.white.after;
    if (ratings?.black?.after !== undefined)
      update.blackRatingAfter = ratings.black.after;

    await Game.updateOne({ gameId: game.id }, { $set: update });
  } catch (error) {
    logger.warn({ err: error, gameId: game.id }, "Failed to finalize game record");
  }
};

/** Single instance: any game still "active" at boot was interrupted by a restart. */
const abandonOrphanedGames = async () => {
  if (!isDbReady()) return 0;
  const { modifiedCount } = await Game.updateMany(
    { status: "active" },
    {
      $set: {
        status: "abandoned",
        reason: "Interrupted by server restart",
        rated: false,
        finishedAt: new Date(),
      },
    },
  );
  if (modifiedCount > 0) {
    logger.info({ count: modifiedCount }, "Marked orphaned games as abandoned");
  }
  return modifiedCount;
};

module.exports = {
  createGameRecord,
  updateGameRecord,
  finalizeGameRecord,
  abandonOrphanedGames,
};
