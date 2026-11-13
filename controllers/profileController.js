const User = require("../models/User");
const authService = require("../services/authService");
const gameManager = require("../game/gameManager");
const { setAuthCookie, clearAuthCookie } = require("../utils/authCookies");
const logger = require("../config/logger");

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
const { DEFAULT_SETTINGS } = authService;

const isApiRequest = (req) => req.originalUrl.startsWith("/api/");

const sanitizeDisplayName = (value) =>
  value ? String(value).trim().replace(/\s+/g, " ").slice(0, 30) : "";

const sanitizeColor = (value, fallback) => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return HEX_COLOR_REGEX.test(trimmed) ? trimmed : fallback;
};

/** Respond with JSON for the API, or re-render the profile page for the web form. */
const respond = async (
  req,
  res,
  { status = 200, error = null, success = null, data },
) => {
  if (isApiRequest(req)) {
    return res
      .status(status)
      .json(
        error
          ? { success: false, error }
          : { success: true, message: success, ...(data && { data }) },
      );
  }
  const user = req.user?.isGuest
    ? req.user
    : (await User.findById(req.user._id).select("-password")) || req.user;
  return res.status(status).render("profile", { user, error, success });
};

exports.getProfilePage = async (req, res, next) => {
  try {
    if (req.user?.isGuest) {
      return res.render("profile", {
        user: req.user,
        error: "Guest users cannot save profile settings. Please create an account.",
        success: null,
      });
    }
    const user = await User.findById(req.user._id).select("-password");
    return res.render("profile", { user, error: null, success: null });
  } catch (error) {
    return next(error);
  }
};

exports.updateProfile = async (req, res) => {
  try {
    if (req.user?.isGuest) {
      return respond(req, res, {
        status: 400,
        error: "Guest users cannot update profile settings.",
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return respond(req, res, { status: 404, error: "User not found." });
    }

    user.displayName = sanitizeDisplayName(req.body.displayName);
    user.settings = {
      boardLight: sanitizeColor(
        req.body.boardLight,
        user.settings?.boardLight || DEFAULT_SETTINGS.boardLight,
      ),
      boardDark: sanitizeColor(
        req.body.boardDark,
        user.settings?.boardDark || DEFAULT_SETTINGS.boardDark,
      ),
      hintColor: sanitizeColor(
        req.body.hintColor,
        user.settings?.hintColor || DEFAULT_SETTINGS.hintColor,
      ),
    };
    await user.save();

    return respond(req, res, {
      success: "Profile settings updated successfully.",
      data: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        settings: user.settings,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Profile update failed");
    return respond(req, res, {
      status: 500,
      error: "Failed to update profile settings.",
    });
  }
};

exports.changePassword = async (req, res) => {
  if (req.user?.isGuest) {
    return respond(req, res, { status: 400, error: "Guest users have no password." });
  }
  try {
    const user = await authService.changePassword(
      req.user._id,
      req.body.currentPassword,
      req.body.newPassword,
    );
    // Old tokens are now revoked; keep this session alive with a fresh one.
    setAuthCookie(res, authService.signToken(user));
    return respond(req, res, {
      success: "Password changed. Other sessions have been signed out.",
    });
  } catch (error) {
    const known = error instanceof authService.AuthError;
    if (!known) logger.error({ err: error }, "Password change failed");
    return respond(req, res, {
      status: known ? error.statusCode : 500,
      error: known ? error.message : "Failed to change password.",
    });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    if (req.user?.isGuest) {
      return respond(req, res, {
        status: 400,
        error: "Guest users do not have a saved account to delete.",
      });
    }

    if (String(req.body.confirmDelete || "").trim() !== "DELETE") {
      return respond(req, res, {
        status: 400,
        error: "To delete your account, type DELETE exactly.",
      });
    }

    if (gameManager.isUserInActiveGame(req.user._id)) {
      return respond(req, res, {
        status: 400,
        error: "Finish your current game before deleting your account.",
      });
    }

    await User.findByIdAndDelete(req.user._id);
    clearAuthCookie(res);

    if (isApiRequest(req)) {
      return res.json({ success: true, message: "Account deleted" });
    }
    return res.redirect("/auth/login");
  } catch (error) {
    logger.error({ err: error }, "Account deletion failed");
    return respond(req, res, { status: 500, error: "Failed to delete account." });
  }
};
