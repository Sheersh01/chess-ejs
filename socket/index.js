const socketIO = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const { getRedisClient } = require("../config/redis");
const { getAllowedOrigins } = require("../config/env");
const { isOriginAllowed } = require("../utils/origin");
const { attachRateLimit } = require("./rateLimit");
const logger = require("../config/logger");

/**
 * Socket.IO server. NOTE: game state is held in this process's memory, so the app
 * must run as a single instance. The optional Redis adapter only fans out
 * broadcasts; it does not make game state shared.
 */
module.exports = async function initSocket(server) {
  const allowedOrigins = getAllowedOrigins();
  const io = socketIO(server, {
    ...(allowedOrigins.length > 0 && {
      cors: { origin: allowedOrigins, credentials: true },
    }),
    // Reject cross-site handshakes (cross-site WebSocket hijacking).
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      callback(null, !origin || isOriginAllowed(origin, req.headers.host));
    },
  });

  const shutdownHooks = [];

  if (process.env.REDIS_URL) {
    try {
      const pubClient = await getRedisClient();
      if (pubClient) {
        const subClient = pubClient.duplicate();
        subClient.on("error", () => {
          // Errors are logged on the primary client.
        });
        await subClient.connect();
        shutdownHooks.push(() => subClient.quit().catch(() => {}));
        io.adapter(createAdapter(pubClient, subClient));
        logger.info("Socket.IO Redis adapter enabled");
      } else {
        logger.info("Using in-memory Socket.IO adapter (Redis not available)");
      }
    } catch (error) {
      logger.warn({ err: error }, "Redis adapter unavailable, using in-memory adapter");
    }
  }

  require("./auth.socket")(io);
  io.on("connection", (socket) => attachRateLimit(socket));
  shutdownHooks.push(require("./matchmaking.socket")(io));
  require("./game.socket")(io);

  io.shutdownHooks = shutdownHooks;
  return io;
};
