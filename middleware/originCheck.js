const { toOrigin, isOriginAllowed } = require("../utils/origin");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence for cookie-authenticated, state-changing requests: browsers always
 * send Origin (or at least Referer) on cross-site POSTs, so reject foreign ones.
 * Requests with neither header come from non-browser clients and are allowed.
 */
const originCheck = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();

  const source = req.get("origin") || toOrigin(req.get("referer") || "");
  if (!source || isOriginAllowed(source, req.get("host"))) return next();

  if (req.originalUrl.startsWith("/api/")) {
    return res
      .status(403)
      .json({ success: false, error: "Cross-origin request blocked" });
  }
  return res.status(403).send("Cross-origin request blocked");
};

module.exports = originCheck;
