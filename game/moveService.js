const timerManager = require("./timerManager");
const botManager = require("./botManager");
const { pieceValues } = require("./constants");
const { endGame, resolveBoardResult, emitDrawOfferState } = require("./gameLifecycle");
const { updateGameRecord } = require("../services/gamePersistence");
const logger = require("../config/logger");

const SQUARE = /^[a-h][1-8]$/;
const PROMOTION = /^[qrbn]$/;

/** Validate untrusted move input; returns a clean {from, to, promotion?} or null. */
const parseMoveInput = (input) => {
  if (!input || typeof input !== "object") return null;
  const { from, to, promotion } = input;
  if (typeof from !== "string" || typeof to !== "string") return null;
  if (!SQUARE.test(from) || !SQUARE.test(to)) return null;
  if (promotion !== undefined && promotion !== null) {
    if (typeof promotion !== "string" || !PROMOTION.test(promotion)) return null;
    return { from, to, promotion };
  }
  return { from, to };
};

const calculateScore = (captured) =>
  captured.reduce((sum, piece) => sum + (pieceValues[piece] || 0), 0);

const applyMoveEffects = (game, move, io) => {
  game.moveHistory.push(move);
  if (move.captured) {
    const capturedBy = move.color === "w" ? "white" : "black";
    game.capturedPieces[capturedBy].push(move.captured);
    game.scores.w = calculateScore(game.capturedPieces.white);
    game.scores.b = calculateScore(game.capturedPieces.black);
    io.to(game.id).emit("capturedPiecesUpdate", game.capturedPieces);
    io.to(game.id).emit("scoreUpdate", game.scores);
  }
};

/**
 * Apply a move for the side to move, run clocks, broadcast, persist and detect the
 * end of the game. Caller is responsible for checking the mover owns this turn.
 */
const playMove = async (game, io, moveInput, { excludeSocketId = null } = {}) => {
  if (game.isFinished || game.status !== "active") {
    return { ok: false, error: "Game is not active" };
  }

  // Time is checked before the move: a move that arrives after the flag fell is void.
  if (timerManager.checkFlag(game)) {
    return { ok: false, error: "Time expired" };
  }

  const moverColor = game.chess.turn() === "w" ? "white" : "black";
  let move;
  try {
    move = game.chess.move(moveInput);
  } catch {
    move = null;
  }
  if (!move) {
    return { ok: false, error: "Invalid move" };
  }

  const now = Date.now();
  applyMoveEffects(game, move, io);

  // Moving instead of answering a pending offer declines it.
  if (game.drawOffer && game.drawOffer.by !== moverColor) {
    game.drawOffer = null;
    emitDrawOfferState(game, io);
  }

  const room = excludeSocketId
    ? io.to(game.id).except(excludeSocketId)
    : io.to(game.id);
  room.emit("move", move);
  io.to(game.id).emit("boardstate", game.chess.fen());
  io.to(game.id).emit("moveHistory", game.moveHistory);

  const outcome = resolveBoardResult(game.chess);
  if (outcome) {
    await endGame(game, io, outcome);
    return { ok: true, move, ended: true };
  }

  timerManager.switchTurn(game, io, moverColor, now);
  io.to(game.id).emit("turnChange", game.chess.turn());
  updateGameRecord(game);
  scheduleBotMove(game, io);

  return { ok: true, move, ended: false };
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** If it's the bot's turn, search in a worker and play the result. */
const scheduleBotMove = (game, io) => {
  const bot = game?.bot;
  if (!game?.isBotGame || !bot || game.isFinished || game.status !== "active") return;
  if (game.chess.turn() !== bot.color || bot.thinking) return;

  const fen = game.chess.fen();
  const token = ++bot.token;
  const startedAt = Date.now();
  bot.thinking = true;

  botManager
    .getBotMoveAsync(fen, {
      difficulty: bot.difficulty,
      personality: bot.personality,
      botColor: bot.color,
    })
    .then(async (botMove) => {
      // Small minimum delay so instant replies don't feel robotic.
      const remainingDelay = bot.minDelayMs - (Date.now() - startedAt);
      if (remainingDelay > 0) await wait(remainingDelay);

      const stale = game.isFinished || bot.token !== token || game.chess.fen() !== fen;
      if (stale || !botMove) return;

      bot.thinking = false;
      const result = await playMove(game, io, botMove);
      if (!result.ok) {
        logger.warn({ gameId: game.id, error: result.error }, "Bot move rejected");
      }
    })
    .catch((err) => logger.error({ err, gameId: game.id }, "Bot move failed"))
    .finally(() => {
      if (bot.token === token) bot.thinking = false;
    });
};

module.exports = { parseMoveInput, playMove, scheduleBotMove };
