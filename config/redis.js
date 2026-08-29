const { createClient } = require("redis");
const logger = require("./logger");

let redisClient = null;

const getRedisClient = async () => {
  if (!process.env.REDIS_URL) {
    return null;
  }

  if (redisClient?.isOpen) {
    return redisClient;
  }

  redisClient = createClient({ url: process.env.REDIS_URL });

  redisClient.on("error", (err) => {
    logger.error({ err }, "Redis client error");
  });

  await redisClient.connect();
  logger.info("Redis connected");
  return redisClient;
};

const closeRedis = async () => {
  if (redisClient?.isOpen) {
    await redisClient.quit();
    redisClient = null;
  }
};

module.exports = { getRedisClient, closeRedis };
