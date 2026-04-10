const { stats } = require("../stats/gameStats");

const TICK_MS = 200;

const getActiveColor = (game) => (game.chess.turn() === "w" ? "white" : "black");

const getDisplaySeconds = (remainingMs) => Math.max(0, Math.ceil(remainingMs / 1000));

const ensureTimerState = (game) => {
  if (!game.timerState) {
    game.timerState = {
      remainingMs: {
        white: (game.timers?.white || 600) * 1000,
        black: (game.timers?.black || 600) * 1000,
      },
      activeColor: null,
      lastUpdatedAt: null,
      lastBroadcastSeconds: { ...game.timers },
      lowTimeNotified: { white: false, black: false },
      running: false,
    };
  }

  return game.timerState;
};

const updateDisplayTimers = (game) => {
  const state = ensureTimerState(game);
  game.timers.white = getDisplaySeconds(state.remainingMs.white);
  game.timers.black = getDisplaySeconds(state.remainingMs.black);
  return game.timers;
};

const emitTimerUpdate = (game, io, force = true) => {
  const state = ensureTimerState(game);
  const timers = updateDisplayTimers(game);
  const changed =
    force ||
    timers.white !== state.lastBroadcastSeconds.white ||
    timers.black !== state.lastBroadcastSeconds.black;

  if (!changed) {
    return;
  }

  state.lastBroadcastSeconds = { ...timers };
  io.to(game.id).emit("timerUpdate", timers);
};

const emitLowTimeIfNeeded = (game, io, color) => {
  const state = ensureTimerState(game);
  const timers = updateDisplayTimers(game);

  if (
    color &&
    !state.lowTimeNotified[color] &&
    state.remainingMs[color] > 0 &&
    timers[color] <= 10
  ) {
    state.lowTimeNotified[color] = true;
    io.to(game.id).emit("lowTime", { color });
  }
};

const handleTimeout = (game, io, color) => {
  stopTimer(game);
  stats.timeouts++;
  stats.completedGames++;

  const winner = color === "white" ? "black" : "white";
  io.to(game.id).emit("timeOut", {
    winner,
    message: `${color === "white" ? "White" : "Black"} ran out of time!`,
  });

  const gameManager = require("./gameManager");
  gameManager.cleanupGame(game.id);
};

const syncActiveTimer = (game, io) => {
  const state = ensureTimerState(game);

  if (!state.running || !state.activeColor || !state.lastUpdatedAt) {
    return false;
  }

  const now = Date.now();
  const elapsedMs = now - state.lastUpdatedAt;
  if (elapsedMs <= 0) {
    return false;
  }

  const color = state.activeColor;
  state.remainingMs[color] = Math.max(0, state.remainingMs[color] - elapsedMs);
  state.lastUpdatedAt = now;

  emitLowTimeIfNeeded(game, io, color);
  updateDisplayTimers(game);

  if (state.remainingMs[color] <= 0) {
    emitTimerUpdate(game, io, true);
    handleTimeout(game, io, color);
    return true;
  }

  return false;
};

const syncToCurrentTurn = (game, io) => {
  const state = ensureTimerState(game);

  if (!state.running) {
    return;
  }

  const timedOut = syncActiveTimer(game, io);
  if (timedOut) {
    return;
  }

  state.activeColor = getActiveColor(game);
  state.lastUpdatedAt = Date.now();
  emitTimerUpdate(game, io, true);
};

const startTimer = (game, io) => {
  const state = ensureTimerState(game);

  if (game.timerInterval) {
    clearInterval(game.timerInterval);
  }

  state.running = true;
  state.activeColor = getActiveColor(game);
  state.lastUpdatedAt = Date.now();
  updateDisplayTimers(game);
  state.lastBroadcastSeconds = { white: -1, black: -1 };

  emitTimerUpdate(game, io, true);

  game.timerInterval = setInterval(() => {
    const timedOut = syncActiveTimer(game, io);
    if (timedOut) {
      return;
    }

    emitTimerUpdate(game, io, false);
  }, TICK_MS);
};

const stopTimer = (game) => {
  const state = ensureTimerState(game);
  state.running = false;
  state.activeColor = null;
  state.lastUpdatedAt = null;

  if (game.timerInterval) {
    clearInterval(game.timerInterval);
    game.timerInterval = null;
  }
};

module.exports = {
  emitTimerUpdate,
  startTimer,
  stopTimer,
  syncToCurrentTurn,
};
