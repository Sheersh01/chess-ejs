const { getTimeControl } = require("./timeControls");

const LOW_TIME_THRESHOLD_MS = 10 * 1000;

const colorForTurn = (turn) => (turn === "w" ? "white" : "black");

const createClock = (timeControl) => {
  const { key, initialMs, incrementMs } = getTimeControl(timeControl);
  return {
    timeControl: key,
    initialMs,
    incrementMs,
    remainingMs: { white: initialMs, black: initialMs },
    activeColor: null,
    turnStartedAt: null,
    running: false,
    lowTimeNotified: { white: false, black: false },
    flagTimeout: null,
    lowTimeTimeout: null,
    onFlag: null,
    io: null,
  };
};

const clearScheduled = (clock) => {
  if (clock.flagTimeout) clearTimeout(clock.flagTimeout);
  if (clock.lowTimeTimeout) clearTimeout(clock.lowTimeTimeout);
  clock.flagTimeout = null;
  clock.lowTimeTimeout = null;
};

const getRemainingMs = (game, color, now = Date.now()) => {
  const clock = game.clock;
  const base = clock.remainingMs[color];
  if (clock.running && clock.activeColor === color && clock.turnStartedAt !== null) {
    return Math.max(0, base - (now - clock.turnStartedAt));
  }
  return Math.max(0, base);
};

const hasFlagged = (game, now = Date.now()) => {
  const clock = game.clock;
  return Boolean(
    clock.running &&
    clock.activeColor &&
    getRemainingMs(game, clock.activeColor, now) <= 0,
  );
};

const buildPayload = (game, now = Date.now()) => {
  const whiteMs = getRemainingMs(game, "white", now);
  const blackMs = getRemainingMs(game, "black", now);
  return {
    white: Math.ceil(whiteMs / 1000),
    black: Math.ceil(blackMs / 1000),
    whiteMs,
    blackMs,
    active: game.clock.running ? game.clock.activeColor : null,
    serverTs: now,
    timeControl: game.clock.timeControl,
  };
};

const emitUpdate = (game, io, target = null) => {
  const payload = buildPayload(game);
  (target || io.to(game.id)).emit("timerUpdate", payload);
};

// Freeze the active side's clock at `now` (charges elapsed time).
const settleActive = (clock, now) => {
  if (clock.running && clock.activeColor && clock.turnStartedAt !== null) {
    const elapsed = Math.max(0, now - clock.turnStartedAt);
    clock.remainingMs[clock.activeColor] = Math.max(
      0,
      clock.remainingMs[clock.activeColor] - elapsed,
    );
    clock.turnStartedAt = now;
  }
};

const schedule = (game) => {
  const clock = game.clock;
  clearScheduled(clock);
  if (!clock.running || !clock.activeColor) {
    return;
  }

  const color = clock.activeColor;
  const remaining = getRemainingMs(game, color);

  if (!clock.lowTimeNotified[color] && remaining > 0) {
    const delay = Math.max(0, remaining - LOW_TIME_THRESHOLD_MS);
    clock.lowTimeTimeout = setTimeout(() => {
      if (
        clock.running &&
        clock.activeColor === color &&
        !clock.lowTimeNotified[color]
      ) {
        clock.lowTimeNotified[color] = true;
        clock.io?.to(game.id).emit("lowTime", { color });
      }
    }, delay);
  }

  clock.flagTimeout = setTimeout(() => {
    if (!clock.running || clock.activeColor !== color) {
      return;
    }
    // Timers can fire a little early; re-arm until the clock really hits zero.
    if (getRemainingMs(game, color) > 0) {
      schedule(game);
      return;
    }
    flag(game);
  }, remaining);
};

const flag = (game) => {
  const clock = game.clock;
  const color = clock.activeColor;
  stop(game);
  clock.remainingMs[color] = 0;
  if (typeof clock.onFlag === "function") {
    clock.onFlag(game, color);
  }
};

/** Start the clock for the side to move. `onFlag(game, color)` fires on flag fall. */
const start = (game, io, onFlag) => {
  const clock = game.clock;
  clock.io = io;
  clock.onFlag = onFlag;
  clock.running = true;
  clock.activeColor = colorForTurn(game.chess.turn());
  clock.turnStartedAt = Date.now();
  schedule(game);
  emitUpdate(game, io);
};

/**
 * Called after a move has been applied: charges the mover, adds increment,
 * and starts the opponent's clock. The caller must check `hasFlagged` first.
 */
const switchTurn = (game, io, moverColor, now = Date.now()) => {
  const clock = game.clock;
  if (!clock.running) {
    return;
  }
  settleActive(clock, now);
  clock.remainingMs[moverColor] += clock.incrementMs;
  clock.activeColor = colorForTurn(game.chess.turn());
  clock.turnStartedAt = now;
  schedule(game);
  emitUpdate(game, io);
};

const stop = (game) => {
  const clock = game.clock;
  if (!clock) return;
  settleActive(clock, Date.now());
  clock.running = false;
  clock.turnStartedAt = null;
  clearScheduled(clock);
};

/** If the side to move has run out of time, end the game on time now. */
const checkFlag = (game) => {
  if (hasFlagged(game)) {
    flag(game);
    return true;
  }
  return false;
};

module.exports = {
  LOW_TIME_THRESHOLD_MS,
  createClock,
  start,
  stop,
  switchTurn,
  hasFlagged,
  checkFlag,
  getRemainingMs,
  emitUpdate,
  buildPayload,
};
