// Load .env before anything reads process.env (logger included).
require("dotenv").config();

const isProduction = () => process.env.NODE_ENV === "production";

/** Comma-separated CLIENT_URL list -> array of allowed origins. */
const getAllowedOrigins = () =>
  (process.env.CLIENT_URL || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);

/** Fail fast on missing or unsafe configuration instead of at first login. */
const validateEnv = () => {
  const errors = [];

  if (!process.env.JWT_SECRET) {
    errors.push("JWT_SECRET is required");
  } else if (isProduction() && process.env.JWT_SECRET.length < 32) {
    errors.push("JWT_SECRET must be at least 32 characters in production");
  }

  if (isProduction()) {
    if (!process.env.MONGODB_URI && !process.env.MONGO_URI) {
      errors.push("MONGODB_URI is required in production");
    }
    if (getAllowedOrigins().length === 0) {
      errors.push(
        "CLIENT_URL is required in production (e.g. https://chess.example.com)",
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n - ${errors.join("\n - ")}`);
  }
};

module.exports = { validateEnv, isProduction, getAllowedOrigins };
