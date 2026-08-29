const http = require("http");
const app = require("./app");
const logger = require("./config/logger");
const { closeRedis } = require("./config/redis");
const gameManager = require("./game/gameManager");

let server;
let io;

const startServer = async () => {
  server = http.createServer(app);
  const socketInit = require("./socket");
  io = await socketInit(server);

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });
};

const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received, shutting down gracefully`);

  for (const game of gameManager.games.values()) {
    if (game.timerInterval) clearInterval(game.timerInterval);
    if (game.bot?.pendingMoveTimeout) clearTimeout(game.bot.pendingMoveTimeout);
    if (game.disconnectTimers?.white) clearTimeout(game.disconnectTimers.white);
    if (game.disconnectTimers?.black) clearTimeout(game.disconnectTimers.black);
  }

  if (io) {
    io.close();
  }

  if (server) {
    server.close(async () => {
      await closeRedis();
      logger.info("Server closed");
      process.exit(0);
    });
  } else {
    process.exit(0);
  }

  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

startServer().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});

module.exports = { server, io };
