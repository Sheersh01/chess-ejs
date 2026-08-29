process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test_jwt_secret";
process.env.JWT_EXPIRE = "1h";
process.env.JWT_COOKIE_EXPIRE = "1";
process.env.MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/chess_test";

const mongoose = require("mongoose");

afterAll(async () => {
  await mongoose.disconnect();
});
