const MINUTE_MS = 60 * 1000;

// Whitelisted time controls: "<minutes>+<increment seconds>".
const TIME_CONTROLS = Object.freeze({
  "1+0": { initialMs: 1 * MINUTE_MS, incrementMs: 0 },
  "3+0": { initialMs: 3 * MINUTE_MS, incrementMs: 0 },
  "3+2": { initialMs: 3 * MINUTE_MS, incrementMs: 2000 },
  "5+0": { initialMs: 5 * MINUTE_MS, incrementMs: 0 },
  "10+0": { initialMs: 10 * MINUTE_MS, incrementMs: 0 },
  "15+10": { initialMs: 15 * MINUTE_MS, incrementMs: 10000 },
});

const DEFAULT_TIME_CONTROL = "10+0";

const normalizeTimeControl = (value) =>
  typeof value === "string" && Object.hasOwn(TIME_CONTROLS, value)
    ? value
    : DEFAULT_TIME_CONTROL;

const getTimeControl = (value) => {
  const key = normalizeTimeControl(value);
  return { key, ...TIME_CONTROLS[key] };
};

module.exports = {
  TIME_CONTROLS,
  DEFAULT_TIME_CONTROL,
  normalizeTimeControl,
  getTimeControl,
};
