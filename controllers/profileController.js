const User = require("../models/User");

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

const sanitizeName = (value) => {
  if (!value) return "";
  return String(value).trim().replace(/\s+/g, " ").slice(0, 20);
};

const sanitizeDisplayName = (value) => {
  if (!value) return "";
  return String(value).trim().replace(/\s+/g, " ").slice(0, 30);
};

const sanitizeColor = (value, fallback) => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return HEX_COLOR_REGEX.test(trimmed) ? trimmed : fallback;
};

exports.getProfilePage = async (req, res) => {
  if (req.user?.isGuest) {
    return res.render("profile", {
      user: req.user,
      error:
        "Guest users cannot save profile settings. Please create an account.",
      success: null,
    });
  }

  const user = await User.findById(req.user.id).select("-password");
  return res.render("profile", {
    user,
    error: null,
    success: null,
  });
};

exports.updateProfile = async (req, res) => {
  try {
    if (req.user?.isGuest) {
      return res.render("profile", {
        user: req.user,
        error: "Guest users cannot update profile settings.",
        success: null,
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).render("profile", {
        user: req.user,
        error: "User not found.",
        success: null,
      });
    }

    const nextUsername = sanitizeName(req.body.username);
    const nextDisplayName = sanitizeDisplayName(req.body.displayName);

    if (nextUsername.length < 3) {
      return res.status(400).render("profile", {
        user,
        error: "Username must be at least 3 characters.",
        success: null,
      });
    }

    if (nextUsername !== user.username) {
      const exists = await User.findOne({ username: nextUsername });
      if (exists) {
        return res.status(400).render("profile", {
          user,
          error: "That username is already taken.",
          success: null,
        });
      }
      user.username = nextUsername;
    }

    user.displayName = nextDisplayName;

    const defaults = {
      boardLight: "#f0d9b5",
      boardDark: "#b58863",
      hintColor: "#14551e",
    };

    user.settings = {
      boardLight: sanitizeColor(
        req.body.boardLight,
        user.settings?.boardLight || defaults.boardLight,
      ),
      boardDark: sanitizeColor(
        req.body.boardDark,
        user.settings?.boardDark || defaults.boardDark,
      ),
      hintColor: sanitizeColor(
        req.body.hintColor,
        user.settings?.hintColor || defaults.hintColor,
      ),
    };

    await user.save();

    return res.render("profile", {
      user,
      error: null,
      success: "Profile settings updated successfully.",
    });
  } catch (error) {
    console.error("Profile update error:", error);
    return res.status(500).render("profile", {
      user: req.user,
      error: "Failed to update profile settings.",
      success: null,
    });
  }
};
