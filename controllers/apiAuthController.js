// JSON API adapter over services/authService.
const authService = require("../services/authService");
const gameManager = require("../game/gameManager");
const { setAuthCookie, clearAuthCookie } = require("../utils/authCookies");
const logger = require("../config/logger");

const sendError = (res, error, fallback) => {
  if (error instanceof authService.AuthError) {
    return res.status(error.statusCode).json({ success: false, error: error.message });
  }
  logger.error({ err: error }, fallback);
  return res.status(500).json({ success: false, error: fallback });
};

const sendSession = (res, statusCode, token, user, maxAge) => {
  setAuthCookie(res, token, maxAge);
  return res.status(statusCode).json({
    success: true,
    token,
    data: authService.serializeUser(user, { includePrivate: true }),
  });
};

exports.register = async (req, res) => {
  try {
    const user = await authService.register(req.body);
    return sendSession(res, 201, authService.signToken(user), user);
  } catch (error) {
    return sendError(res, error, "Server error during registration");
  }
};

exports.login = async (req, res) => {
  try {
    const user = await authService.login(req.body);
    return sendSession(res, 200, authService.signToken(user), user);
  } catch (error) {
    return sendError(res, error, "Server error during login");
  }
};

exports.guestLogin = (req, res) => {
  const { token, user, maxAge } = authService.createGuestSession();
  return sendSession(res, 200, token, user, maxAge);
};

exports.logout = async (req, res) => {
  const user = await authService.verifyToken(req.cookies?.token).catch(() => null);
  if (user && gameManager.isUserInActiveGame(user._id || user.id)) {
    return res.status(400).json({
      success: false,
      error: "Cannot logout while a game is in progress",
    });
  }
  clearAuthCookie(res);
  return res.json({ success: true, message: "Logged out" });
};

exports.changePassword = async (req, res) => {
  if (req.user?.isGuest) {
    return res.status(400).json({ success: false, error: "Guests have no password" });
  }
  try {
    const user = await authService.changePassword(
      req.user._id,
      req.body.currentPassword,
      req.body.newPassword,
    );
    const token = authService.signToken(user);
    setAuthCookie(res, token);
    return res.json({ success: true, token, message: "Password updated" });
  } catch (error) {
    return sendError(res, error, "Failed to change password");
  }
};
