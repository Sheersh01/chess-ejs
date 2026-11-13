process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";
process.env.JWT_SECRET = "test_jwt_secret_that_is_long_enough_123";
process.env.JWT_EXPIRE = "1h";
process.env.JWT_COOKIE_EXPIRE = "1";
process.env.MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/chess_test";
process.env.COUNTDOWN_SECONDS = "0";
process.env.COUNTDOWN_TICK_MS = "30";
process.env.DISCONNECT_GRACE_MS = "800";
// Empty (not deleted) so dotenv can't refill them from a developer's .env.
process.env.REDIS_URL = "";
process.env.CLIENT_URL = "";

const mongoose = require("mongoose");

afterAll(async () => {
  await mongoose.disconnect();
});
