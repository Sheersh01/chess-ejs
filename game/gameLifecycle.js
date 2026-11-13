const gameManager = require("./gameManager");
const timerManager = require("./timerManager");
const { hasMatingMaterial } = require("./chessRules");
const { stats } = require("../stats/gameStats");
const { recordResult } = require("../services/playerResultService");
const { finalizeGameRecord } = require("../services/gamePersistence");
const logger = require("../config/logger");

const CLEANUP_DELAY_MS = 5000;

const capitalize = (color) => color.charAt(0).toUpperCase() + color.slice(1);
const opposite = (color) => (color === "white" ? "black" : "white");

const buildMessage = (result, reason) => {
  if (!result) return reason || "Game aborted";
  if (result === "draw") return reason || "It's a draw!";
  const winner = capitalize(result);
  return reason ? `${reason}. ${winner} wins!` : `${winner} wins!`;
};

/** Result for a position that is over on the board, or null if play continues. */
const resolveBoardResult = (chess) => {
  if (!chess.isGameOver()) return null;
  if (chess.isCheckmate()) {
    return { result: chess.turn() === "w" ? "black" : "white", reason: "Checkmate!" };
  }
  if (chess.isStalemate()) return { result: "draw", reason: "Stalemate!" };
  if (chess.isThreefoldRepetition()) {
    return { result: "draw", reason: "Draw by threefold repetition" };
  }
  if (chess.isInsufficientMaterial()) {
    return { result: "draw", reason: "Draw by insufficient material" };
  }
  return { result: "draw", reason: "Draw by 50-move rule" };
};

/** Flag fall: the opponent wins unless they have no mating material (then draw). */
const timeoutResult = (game, flaggedColor) => {
  const winner = opposite(flaggedColor);
  if (!hasMatingMaterial(game.chess, winner)) {
    return {
      result: "draw",
      reason: `${capitalize(flaggedColor)} ran out of time, but ${capitalize(
        winner,
      )} has insufficient material`,
    };
  }
  return { result: winner, reason: `${capitalize(flaggedColor)} ran out of time` };
};

const updateStats = (result, reason) => {
  if (!result) return;
  stats.completedGames++;
  if (result === "white") stats.whiteWins++;
  else if (result === "black") stats.blackWins++;
  else stats.draws++;
  if (reason === "Checkmate!") stats.checkmates++;
};

/**
 * The only way a game ends. Idempotent: the first call wins, later calls are no-ops.
 * Players are notified immediately; persistence happens afterwards and can never
 * prevent cleanup.
 */
const endGame = async (
  game,
  io,
  { result, reason = "", status = "completed", events = [] },
) => {
  if (!game || game.isFinished) {
    return false;
  }

  game.isFinished = true;
  game.status = "finished";
  game.drawOffer = null;
  gameManager.releaseResources(game);
  updateStats(result, reason);

  for (const [event, payload] of events) {
    io.to(game.id).emit(event, payload);
  }
  timerManager.emitUpdate(game, io);
  io.to(game.id).emit("gameOver", {
    result: result || null,
    reason,
    status,
    message: buildMessage(result, reason),
  });

  try {
    const ratings = await recordResult(game, result, reason, io);
    await finalizeGameRecord(game, { result, reason, status, ratings });
  } catch (error) {
    logger.error({ err: error, gameId: game.id }, "Failed to persist game result");
  } finally {
    game.cleanupTimeout = setTimeout(
      () => gameManager.cleanupGame(game.id),
      CLEANUP_DELAY_MS,
    );
    game.cleanupTimeout.unref?.();
  }

  return true;
};

const handleFlag = (game, io, flaggedColor) => {
  const { result, reason } = timeoutResult(game, flaggedColor);
  stats.timeouts++;
  return endGame(game, io, {
    result,
    reason,
    events: [
      [
        "timeOut",
        {
          winner: result === "draw" ? null : result,
          flagged: flaggedColor,
          message: reason,
        },
      ],
    ],
  });
};

const startGameClock = (game, io) => {
  game.status = "active";
  timerManager.start(game, io, (flaggedGame, color) => {
    handleFlag(flaggedGame, io, color).catch((err) =>
      logger.error({ err, gameId: flaggedGame.id }, "Timeout handling failed"),
    );
  });
};

/** Shutdown: end every live game as abandoned and unrated, and wait for persistence. */
const abortAllGames = async (io, reason = "Server restarting") => {
  const live = Array.from(gameManager.games.values()).filter(
    (game) => !game.isFinished,
  );
  await Promise.all(
    live.map((game) =>
      endGame(game, io, { result: null, reason, status: "abandoned" }),
    ),
  );
  return live.length;
};

module.exports = {
  CLEANUP_DELAY_MS,
  capitalize,
  opposite,
  resolveBoardResult,
  timeoutResult,
  endGame,
  handleFlag,
  startGameClock,
  abortAllGames,
};
