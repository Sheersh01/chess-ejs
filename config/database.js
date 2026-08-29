const mongoose = require("mongoose");
const logger = require("./logger");

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) {
      logger.warn("No MONGODB_URI set - running without database");
      return;
    }
    const conn = await mongoose.connect(uri);
    logger.info(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    logger.error(`MongoDB Connection Error: ${error.message}`);
    logger.info("Running without database - guest mode only");
  }
};

module.exports = connectDB;
