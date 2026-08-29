const User = require("../models/User");
const jwt = require("jsonwebtoken");
const gameManager = require("../game/gameManager");

const hasUnfinishedGame = (userId) => {
  const userKey = String(userId);

  return Array.from(gameManager.games.values()).some(
    (game) =>
      !game.isFinished &&
      (String(game.userIds.white) === userKey ||
        String(game.userIds.black) === userKey),
  );
};

// @desc    Register user
// @route   POST /auth/register
exports.register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }],
    });

    if (existingUser) {
      return res.status(400).render("register", {
        error:
          existingUser.email === email
            ? "Email already registered"
            : "Username already taken",
        username,
        email,
      });
    }

    // Create user
    await User.create({
      username,
      email,
      password,
    });

    // Require a fresh login after registration
    res.status(201).redirect("/auth/login");
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).render("register", {
      error: error.message || "Server error during registration",
      username: req.body.username,
      email: req.body.email,
    });
  }
};

// @desc    Login user
// @route   POST /auth/login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate email & password
    if (!email || !password) {
      return res.status(400).render("login", {
        error: "Please provide email and password",
        email,
      });
    }

    // Check for user
    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      return res.status(401).render("login", {
        error: "Invalid credentials",
        email,
      });
    }

    // Check if password matches
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).render("login", {
        error: "Invalid credentials",
        email,
      });
    }

    // Send token response
    sendTokenResponse(user, 200, res);
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).render("login", {
      error: "Server error during login",
      email: req.body.email,
    });
  }
};

// @desc    Logout user
// @route   GET /auth/logout
exports.logout = (req, res) => {
  try {
    const token = req.cookies?.token;
    if (token && token !== "none") {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded?.id && hasUnfinishedGame(decoded.id)) {
        return res.redirect("/?matchExitBlocked=1");
      }
    }
  } catch (error) {
    // Ignore token parse failures and continue with logout.
  }

  res.cookie("token", "none", {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });

  res.redirect("/auth/login");
};

// @desc    Guest login
// @route   POST /auth/guest
exports.guestLogin = async (req, res) => {
  try {
    // Generate a unique guest username
    const guestId = `Guest${Math.floor(Math.random() * 10000)}`;

    // Create a guest token with temporary data
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

    // Create token for guest
    const token = jwt.sign(guestData, process.env.JWT_SECRET, {
      expiresIn: "24h", // Guest session expires in 24 hours
    });

    // Set cookie
    const options = {
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    };

    res.cookie("token", token, options);
    res.redirect("/");
  } catch (error) {
    console.error("Guest login error:", error);
    res.status(500).render("login", {
      error: "Failed to create guest session",
      email: "",
    });
  }
};

// @desc    Get current user
// @route   GET /auth/me
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
};

// Helper function to get token from model, create cookie and send response
const sendTokenResponse = (user, statusCode, res) => {
  // Create token
  const token = user.getSignedJwtToken();

  const options = {
    expires: new Date(Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000),
    httpOnly: true,
  };

  if (process.env.NODE_ENV === "production") {
    options.secure = true;
  }

  res.status(statusCode).cookie("token", token, options).redirect("/");
};
