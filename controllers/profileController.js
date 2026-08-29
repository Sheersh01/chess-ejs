const User = require("../models/User");

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

const isApiRequest = (req) => req.originalUrl.includes("/api/");

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
      error: "Guest users cannot save profile settings. Please create an account.",
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
      if (isApiRequest(req)) {
        return res.status(400).json({
          success: false,
          error: "Guest users cannot update profile settings.",
        });
      }
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

    const nextDisplayName = sanitizeDisplayName(req.body.displayName);

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

    if (isApiRequest(req)) {
      return res.json({
        success: true,
        data: {
          id: user._id,
          username: user.username,
          displayName: user.displayName,
          settings: user.settings,
        },
        message: "Profile settings updated successfully.",
      });
    }

    return res.render("profile", {
      user,
      error: null,
      success: "Profile settings updated successfully.",
    });
  } catch (error) {
    console.error("Profile update error:", error);
    if (isApiRequest(req)) {
      return res.status(500).json({
        success: false,
        error: "Failed to update profile settings.",
      });
    }
    return res.status(500).render("profile", {
      user: req.user,
      error: "Failed to update profile settings.",
      success: null,
    });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    if (req.user?.isGuest) {
      return res.render("profile", {
        user: req.user,
        error: "Guest users do not have a saved account to delete.",
        success: null,
      });
    }

    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      res.cookie("token", "none", {
        expires: new Date(Date.now() + 10 * 1000),
        httpOnly: true,
      });
      return res.redirect("/auth/login");
    }

    const confirmation = String(req.body.confirmDelete || "").trim();
    if (confirmation !== "DELETE") {
      if (isApiRequest(req)) {
        return res.status(400).json({
          success: false,
          error: "To delete your account, type DELETE exactly.",
        });
      }
      return res.status(400).render("profile", {
        user,
        error: "To delete your account, type DELETE exactly.",
        success: null,
      });
    }

    await User.findByIdAndDelete(req.user.id);

    res.cookie("token", "none", {
      expires: new Date(Date.now() + 10 * 1000),
      httpOnly: true,
    });

    if (isApiRequest(req)) {
      return res.json({ success: true, message: "Account deleted" });
    }

    return res.redirect("/auth/login");
  } catch (error) {
    console.error("Delete account error:", error);
    return res.status(500).render("profile", {
      user: req.user,
      error: "Failed to delete account.",
      success: null,
    });
  }
};
