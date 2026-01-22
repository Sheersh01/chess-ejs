const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Protect routes - verify JWT token
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

    // Check if this is a guest user
    if (decoded.isGuest) {
      req.user = {
        _id: decoded.id,
        id: decoded.id,
        username: decoded.username,
        rating: decoded.rating,
        gamesPlayed: decoded.gamesPlayed,
        wins: decoded.wins,
        losses: decoded.losses,
        draws: decoded.draws,
        isGuest: true,
      };
    } else {
      // Get user from database
      req.user = await User.findById(decoded.id).select("-password");
      if (!req.user) {
        return res.status(401).redirect("/auth/login");
      }
    }

    next();
  } catch (error) {
    return res.status(401).redirect("/auth/login");
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

      // Check if this is a guest user
      if (decoded.isGuest) {
        req.user = {
          _id: decoded.id,
          id: decoded.id,
          username: decoded.username,
          rating: decoded.rating,
          gamesPlayed: decoded.gamesPlayed,
          wins: decoded.wins,
          losses: decoded.losses,
          draws: decoded.draws,
          isGuest: true,
        };
      } else {
        req.user = await User.findById(decoded.id).select("-password");
      }
      res.locals.user = req.user;
    } catch (error) {
      res.locals.user = null;
    }
  } else {
    res.locals.user = null;
  }

  next();
};
