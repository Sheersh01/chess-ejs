const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { isDbReady } = require("../config/database");
const { DAY_MS } = require("../utils/authCookies");

const GUEST_SESSION_MS = DAY_MS;
const DEFAULT_SETTINGS = Object.freeze({
  boardLight: "#f0d9b5",
  boardDark: "#b58863",
  hintColor: "#14551e",
});

class AuthError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
  }
}

const signToken = (user) =>
  jwt.sign(
    { id: String(user._id), tv: user.tokenVersion || 0 },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRE || "7d",
    },
  );

const buildGuestUser = (decoded) => ({
  _id: decoded.id,
  id: decoded.id,
  username: decoded.username,
  displayName: decoded.username,
  rating: 1200,
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  settings: { ...DEFAULT_SETTINGS },
  isGuest: true,
});

const createGuestSession = () => {
  const guest = {
    id: `guest_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`,
    username: `Guest${crypto.randomInt(1000, 100000)}`,
    isGuest: true,
  };
  const token = jwt.sign(guest, process.env.JWT_SECRET, {
    expiresIn: GUEST_SESSION_MS / 1000,
  });
  return { token, user: buildGuestUser(guest), maxAge: GUEST_SESSION_MS };
};

const ensureDb = () => {
  if (!isDbReady()) {
    throw new AuthError("Accounts are unavailable right now. Try guest mode.", 503);
  }
};

const register = async ({ username, email, password }) => {
  ensureDb();
  const existing = await User.findOne({ $or: [{ email }, { username }] }).lean();
  if (existing) {
    throw new AuthError(
      existing.email === email ? "Email already registered" : "Username already taken",
    );
  }

  try {
    return await User.create({ username, email, password });
  } catch (error) {
    if (error.code === 11000) {
      throw new AuthError("Email or username already registered");
    }
    if (error.name === "ValidationError") {
      throw new AuthError(Object.values(error.errors)[0]?.message || "Invalid input");
    }
    throw error;
  }
};

const login = async ({ email, password }) => {
  ensureDb();
  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await user.matchPassword(password))) {
    throw new AuthError("Invalid credentials", 401);
  }
  return user;
};

/** Changes the password and bumps tokenVersion, which revokes every existing token. */
const changePassword = async (userId, currentPassword, newPassword) => {
  ensureDb();
  const user = await User.findById(userId).select("+password");
  if (!user) throw new AuthError("User not found", 404);
  if (!(await user.matchPassword(currentPassword))) {
    throw new AuthError("Current password is incorrect", 401);
  }
  if (currentPassword === newPassword) {
    throw new AuthError("New password must be different from the current one");
  }

  user.password = newPassword;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  user.passwordChangedAt = new Date();
  await user.save();
  return user;
};

/**
 * Resolve a JWT to a user: a guest object, or the DB user (without password).
 * Returns null for invalid, expired or revoked tokens.
 */
const verifyToken = async (token) => {
  if (!token || typeof token !== "string" || token === "none") return null;

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }

  if (decoded.isGuest) return buildGuestUser(decoded);
  if (!isDbReady()) return null;

  const user = await User.findById(decoded.id).select("-password");
  if (!user || (decoded.tv ?? 0) !== (user.tokenVersion ?? 0)) return null;
  return user;
};

const serializeUser = (user, { includePrivate = false } = {}) => ({
  id: user._id || user.id,
  username: user.username,
  displayName: user.displayName || user.username,
  rating: user.rating,
  gamesPlayed: user.gamesPlayed,
  wins: user.wins,
  losses: user.losses,
  draws: user.draws,
  isGuest: Boolean(user.isGuest),
  ...(includePrivate && {
    email: user.email,
    winStreak: user.winStreak,
    bestWinStreak: user.bestWinStreak,
    settings: user.settings,
    gameHistory: user.gameHistory,
  }),
});

module.exports = {
  AuthError,
  DEFAULT_SETTINGS,
  signToken,
  createGuestSession,
  register,
  login,
  changePassword,
  verifyToken,
  serializeUser,
};
