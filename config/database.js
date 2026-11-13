const mongoose = require("mongoose");
const logger = require("./logger");

const isDbReady = () => mongoose.connection.readyState === 1;

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  const isProduction = process.env.NODE_ENV === "production";

  if (!uri) {
    if (isProduction) {
      throw new Error("MONGODB_URI is required in production");
    }
    logger.warn("No MONGODB_URI set - running without database (guest mode only)");
    return false;
  }

  try {
    const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    logger.info(`MongoDB connected: ${conn.connection.host}`);

    // Make sure declared indexes exist (and stale ones are dropped).
    await Promise.all(
      Object.values(mongoose.models).map((model) => model.syncIndexes()),
    );
    return true;
  } catch (error) {
    if (isProduction) {
      throw error;
    }
    logger.error({ err: error }, "MongoDB connection failed - guest mode only");
    return false;
  }
};

const closeDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
};

module.exports = connectDB;
module.exports.connectDB = connectDB;
module.exports.closeDB = closeDB;
module.exports.isDbReady = isDbReady;
