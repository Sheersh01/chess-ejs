const { validateEnv } = require("./config/env"); // loads .env before anything else
const http = require("http");
const logger = require("./config/logger");
const { connectDB, closeDB } = require("./config/database");
const { closeRedis } = require("./config/redis");
const { abortAllGames } = require("./game/gameLifecycle");
const botManager = require("./game/botManager");
const { abandonOrphanedGames } = require("./services/gamePersistence");

const SHUTDOWN_TIMEOUT_MS = 10000;

/** Build and start the HTTP + Socket.IO server. Returns handles for tests/shutdown. */
const start = async ({ port = process.env.PORT || 3000 } = {}) => {
  validateEnv();
  const app = require("./app");
  const initSocket = require("./socket");

  await connectDB();
  // Single instance: anything still "active" in the DB was cut off by a restart.
  await abandonOrphanedGames();

  const server = http.createServer(app);
  const io = await initSocket(server);

  await new Promise((resolve) => server.listen(port, resolve));
  logger.info(`Server running on port ${server.address().port}`);

  let stopping = null;
  const stop = (reason = "Server shutting down") => {
    if (stopping) return stopping;
    stopping = (async () => {
      // Tell players and persist abandoned games before sockets close.
      const aborted = await abortAllGames(io, reason);
      if (aborted > 0) logger.info({ aborted }, "Aborted live games");
      await botManager.shutdown();
      await new Promise((resolve) => io.close(() => resolve()));
      await Promise.all((io.shutdownHooks || []).map((hook) => hook()));
      if (server.listening) {
        await new Promise((resolve) => server.close(() => resolve()));
      }
      await closeRedis();
      await closeDB();
    })();
    return stopping;
  };

  return { app, server, io, stop };
};

if (require.main === module) {
  start()
    .then(({ stop }) => {
      const shutdown = async (signal) => {
        logger.info(`${signal} received, shutting down gracefully`);
        setTimeout(() => {
          logger.error("Forced shutdown after timeout");
          process.exit(1);
        }, SHUTDOWN_TIMEOUT_MS).unref();
        try {
          await stop("Server restarting");
          logger.info("Server closed");
          process.exit(0);
        } catch (error) {
          logger.error({ err: error }, "Error during shutdown");
          process.exit(1);
        }
      };
      process.on("SIGTERM", () => shutdown("SIGTERM"));
      process.on("SIGINT", () => shutdown("SIGINT"));
    })
    .catch((error) => {
      logger.error({ err: error }, "Failed to start server");
      process.exit(1);
    });
}

module.exports = { start };
