// Web (form + redirect) adapter over services/authService.
const authService = require("../services/authService");
const gameManager = require("../game/gameManager");
const { setAuthCookie, clearAuthCookie } = require("../utils/authCookies");
const logger = require("../config/logger");

const renderError = (res, view, error, locals) => {
  const isKnown = error instanceof authService.AuthError;
  if (!isKnown) logger.error({ err: error }, `${view} failed`);
  return res.status(isKnown ? error.statusCode : 500).render(view, {
    error: isKnown ? error.message : "Something went wrong. Please try again.",
    ...locals,
  });
};

exports.showLogin = (req, res) => res.render("login", { error: null, email: "" });

exports.showRegister = (req, res) =>
  res.render("register", { error: null, username: "", email: "" });

exports.register = async (req, res) => {
  const { username, email, password } = req.body;
  try {
    await authService.register({ username, email, password });
    // Require a fresh login after registration.
    return res.redirect("/auth/login");
  } catch (error) {
    return renderError(res, "register", error, { username, email });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await authService.login({ email, password });
    setAuthCookie(res, authService.signToken(user));
    return res.redirect("/");
  } catch (error) {
    return renderError(res, "login", error, { email });
  }
};

exports.guestLogin = (req, res) => {
  const { token, maxAge } = authService.createGuestSession();
  setAuthCookie(res, token, maxAge);
  return res.redirect("/");
};

exports.logout = async (req, res) => {
  const user = await authService.verifyToken(req.cookies?.token).catch(() => null);
  if (user && gameManager.isUserInActiveGame(user._id || user.id)) {
    return res.redirect("/?matchExitBlocked=1");
  }
  clearAuthCookie(res);
  return res.redirect("/auth/login");
};
