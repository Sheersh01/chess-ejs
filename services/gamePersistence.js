const Game = require("../models/Game");
const logger = require("../config/logger");

const createGameRecord = async (game) => {
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
      status: "active",
      fen: game.chess.fen(),
      pgn: game.chess.pgn(),
      whiteRatingBefore: game.initialRatings?.white,
      blackRatingBefore: game.initialRatings?.black,
      startedAt: new Date(),
    });
  } catch (error) {
    logger.warn({ err: error, gameId: game.id }, "Failed to create game record");
  }
};

const updateGameRecord = async (game) => {
  try {
    await Game.findOneAndUpdate(
      { gameId: game.id },
      {
        fen: game.chess.fen(),
        pgn: game.chess.pgn(),
        moveCount: game.moveHistory?.length || 0,
      },
    );
  } catch (error) {
    logger.warn({ err: error, gameId: game.id }, "Failed to update game record");
  }
};

const finalizeGameRecord = async (game, result, reason) => {
  try {
    await Game.findOneAndUpdate(
      { gameId: game.id },
      {
        status: "completed",
        result,
        reason: reason || "",
        fen: game.chess.fen(),
        pgn: game.chess.pgn(),
        moveCount: game.moveHistory?.length || 0,
        finishedAt: new Date(),
      },
    );
  } catch (error) {
    logger.warn({ err: error, gameId: game.id }, "Failed to finalize game record");
  }
};

module.exports = {
  createGameRecord,
  updateGameRecord,
  finalizeGameRecord,
};
