const jwt = require("jsonwebtoken");
const User = require("../models/User");

const buildGuestUser = (decoded) => ({
  _id: decoded.id,
  id: decoded.id,
  username: decoded.username,
  displayName: decoded.username,
  rating: decoded.rating,
  gamesPlayed: decoded.gamesPlayed,
  wins: decoded.wins,
  losses: decoded.losses,
  draws: decoded.draws,
  settings: {
    boardLight: "#f0d9b5",
    boardDark: "#b58863",
    hintColor: "#14551e",
  },
  isGuest: true,
});

const resolveUserFromToken = async (decoded) => {
  if (decoded.isGuest) {
    return buildGuestUser(decoded);
  }
  return User.findById(decoded.id).select("-password");
};

// Protect routes - verify JWT token (page routes redirect on failure)
exports.protect = async (req, res, next) => {
  let token;

  // Check for token in cookies or authorization header
  if (req.cookies.token) {
    token = req.cookies.token;
  } else if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  // Check if token exists
  if (!token) {
    return res.status(401).redirect("/auth/login");
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = await resolveUserFromToken(decoded);
    if (!req.user) {
      return res.status(401).redirect("/auth/login");
    }

    next();
  } catch (error) {
    return res.status(401).redirect("/auth/login");
  }
};

// Protect API routes - returns JSON on failure
exports.protectApi = async (req, res, next) => {
  let token;

  if (req.cookies.token) {
    token = req.cookies.token;
  } else if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token || token === "none") {
    return res.status(401).json({ success: false, error: "Not authorized" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await resolveUserFromToken(decoded);
    if (!req.user) {
      return res.status(401).json({ success: false, error: "Not authorized" });
    }
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: "Not authorized" });
  }
};

// Check if user is authenticated (for views)
exports.isAuthenticated = async (req, res, next) => {
  let token;

  if (req.cookies.token) {
    token = req.cookies.token;
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.user = await resolveUserFromToken(decoded);
      res.locals.user = req.user;
    } catch (error) {
      res.locals.user = null;
    }
  } else {
    res.locals.user = null;
  }

  next();
};
