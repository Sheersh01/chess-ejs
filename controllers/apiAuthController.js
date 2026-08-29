const User = require("../models/User");
const jwt = require("jsonwebtoken");
const gameManager = require("../game/gameManager");
const logger = require("../config/logger");

const hasUnfinishedGame = (userId) => {
  const userKey = String(userId);
  return Array.from(gameManager.games.values()).some(
    (game) =>
      !game.isFinished &&
      (String(game.userIds.white) === userKey ||
        String(game.userIds.black) === userKey),
  );
};

const cookieOptions = () => {
  const options = {
    expires: new Date(
      Date.now() + (process.env.JWT_COOKIE_EXPIRE || 7) * 24 * 60 * 60 * 1000,
    ),
    httpOnly: true,
  };
  if (process.env.NODE_ENV === "production") {
    options.secure = true;
  }
  return options;
};

const sendTokenResponse = (user, statusCode, res) => {
  const token = user.getSignedJwtToken();
  res.status(statusCode).cookie("token", token, cookieOptions()).json({
    success: true,
    data: {
      id: user._id,
      username: user.username,
      displayName: user.displayName || user.username,
      email: user.email,
      rating: user.rating,
      gamesPlayed: user.gamesPlayed,
      wins: user.wins,
      losses: user.losses,
      draws: user.draws,
      settings: user.settings,
    },
  });
};

exports.register = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error:
          existingUser.email === email
            ? "Email already registered"
            : "Username already taken",
      });
    }

    const user = await User.create({ username, email, password });
    sendTokenResponse(user, 201, res);
  } catch (error) {
    logger.error({ err: error }, "API registration error");
    res.status(500).json({ success: false, error: "Server error during registration" });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select("+password");

    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ success: false, error: "Invalid credentials" });
    }

    sendTokenResponse(user, 200, res);
  } catch (error) {
    logger.error({ err: error }, "API login error");
    res.status(500).json({ success: false, error: "Server error during login" });
  }
};

exports.guestLogin = async (req, res) => {
  try {
    const guestId = `Guest${Math.floor(Math.random() * 10000)}`;
    const guestData = {
      id: `guest_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      username: guestId,
      rating: 1200,
      isGuest: true,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
    };

    const token = jwt.sign(guestData, process.env.JWT_SECRET, {
      expiresIn: "24h",
    });

    const options = {
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    };

    res.cookie("token", token, options).json({
      success: true,
      data: {
        id: guestData.id,
        username: guestData.username,
        displayName: guestData.username,
        rating: guestData.rating,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        isGuest: true,
        settings: {
          boardLight: "#f0d9b5",
          boardDark: "#b58863",
          hintColor: "#14551e",
        },
      },
    });
  } catch (error) {
    logger.error({ err: error }, "API guest login error");
    res.status(500).json({ success: false, error: "Failed to create guest session" });
  }
};

exports.logout = (req, res) => {
  try {
    const token = req.cookies?.token;
    if (token && token !== "none") {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded?.id && hasUnfinishedGame(decoded.id)) {
        return res.status(400).json({
          success: false,
          error: "Cannot logout while a game is in progress",
        });
      }
    }
  } catch (error) {
    // Continue logout on token parse failure
  }

  res.cookie("token", "none", {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });
  res.json({ success: true, message: "Logged out" });
};
