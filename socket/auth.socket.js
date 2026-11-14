const cookie = require("cookie");
const { verifyToken } = require("../services/authService");
const logger = require("../config/logger");

const normalizeToken = (raw) => {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.replace(/^"|"$/g, "").trim();
  if (!trimmed || trimmed === "none") return null;
  return trimmed.startsWith("Bearer ")
    ? trimmed.slice("Bearer ".length).trim()
    : trimmed;
};

const extractSocketToken = (handshake) => {
  const cookies = handshake.headers.cookie
    ? cookie.parse(handshake.headers.cookie)
    : {};
  return (
    normalizeToken(cookies.token) ||
    normalizeToken(handshake.auth?.token) ||
    normalizeToken(handshake.headers.authorization)
  );
};

module.exports = (io) => {
  io.use(async (socket, next) => {
    try {
      const user = await verifyToken(extractSocketToken(socket.handshake));
      if (!user) {
        return next(new Error("Authentication error"));
      }
      socket.user = user;
      return next();
    } catch (error) {
      logger.warn({ err: error }, "Socket authentication failed");
      return next(new Error("Authentication error"));
    }
  });
};

module.exports.extractSocketToken = extractSocketToken;
