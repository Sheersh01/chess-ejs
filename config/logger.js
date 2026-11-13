const pino = require("pino");

const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === "test" ? "silent" : "info"),
  // Never write credentials to logs.
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      'res.headers["set-cookie"]',
      "password",
      "*.password",
      "currentPassword",
      "newPassword",
      "token",
    ],
    censor: "[redacted]",
  },
  // The transport runs in a worker thread; skip it in production and tests.
  transport:
    process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test"
      ? { target: "pino/file", options: { destination: 1 } }
      : undefined,
});

module.exports = logger;
