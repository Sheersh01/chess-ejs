const { createClient } = require("redis");
const logger = require("./logger");

let redisClient = null;
let redisDisabled = false;
let lastErrorLogAt = 0;

const normalizeRedisUrl = (url) => {
  if (!url) return url;
  // Upstash requires TLS; upgrade plain redis:// URLs automatically.
  if (url.includes("upstash.io") && url.startsWith("redis://")) {
    return url.replace("redis://", "rediss://");
  }
  return url;
};

const logRedisError = (err) => {
  const now = Date.now();
  if (now - lastErrorLogAt < 15000) {
    return;
  }
  lastErrorLogAt = now;
  logger.warn({ err }, "Redis client error");
};

const getRedisClient = async () => {
  if (!process.env.REDIS_URL || redisDisabled) {
    return null;
  }

  if (redisClient?.isOpen) {
    return redisClient;
  }

  const url = normalizeRedisUrl(process.env.REDIS_URL);

  try {
    redisClient = createClient({
      url,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 5) {
            redisDisabled = true;
            logger.warn("Redis reconnect limit reached; using in-memory mode");
            return new Error("Redis reconnect limit reached");
          }
          return Math.min(retries * 200, 2000);
        },
      },
    });

    redisClient.on("error", logRedisError);

    await redisClient.connect();
    logger.info("Redis connected");
    return redisClient;
  } catch (error) {
    redisDisabled = true;
    redisClient = null;
    logger.warn({ err: error }, "Redis unavailable, continuing without Redis");
    return null;
  }
};

const closeRedis = async () => {
  if (redisClient?.isOpen) {
    await redisClient.quit();
    redisClient = null;
  }
};

module.exports = { getRedisClient, closeRedis };
