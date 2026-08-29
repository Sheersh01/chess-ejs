const socketIO = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const { getRedisClient } = require("../config/redis");
const logger = require("../config/logger");

module.exports = async function initSocket(server) {
  const io = socketIO(server, {
    cors: {
      origin: process.env.CLIENT_URL || true,
      credentials: true,
    },
  });

  if (process.env.REDIS_URL) {
    try {
      const pubClient = await getRedisClient();
      const subClient = pubClient.duplicate();
      await subClient.connect();
      io.adapter(createAdapter(pubClient, subClient));
      logger.info("Socket.IO Redis adapter enabled");
    } catch (error) {
      logger.warn({ err: error }, "Redis adapter unavailable, using in-memory adapter");
    }
  }

  require("./auth.socket")(io);
  require("./matchmaking.socket")(io);
  require("./game.socket")(io);

  return io;
};
