const { verifyToken } = require("../services/authService");

const extractToken = (req) => {
  if (req.cookies?.token && req.cookies.token !== "none") {
    return req.cookies.token;
  }
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  return null;
};

const authenticate = async (req, res) => {
  const user = await verifyToken(extractToken(req));
  if (user) {
    req.user = user;
    res.locals.user = user;
  }
  return user;
};

// Page routes: redirect to login on failure.
exports.protect = async (req, res, next) => {
  try {
    if (await authenticate(req, res)) return next();
    return res.redirect("/auth/login");
  } catch (error) {
    return next(error);
  }
};

// API routes: JSON 401 on failure.
exports.protectApi = async (req, res, next) => {
  try {
    if (await authenticate(req, res)) return next();
    return res.status(401).json({ success: false, error: "Not authorized" });
  } catch (error) {
    return next(error);
  }
};

// Attach the user when present, never block.
exports.optionalAuth = async (req, res, next) => {
  try {
    await authenticate(req, res);
  } catch {
    // ignore - treated as anonymous
  }
  res.locals.user = req.user || null;
  next();
};

exports.extractToken = extractToken;
