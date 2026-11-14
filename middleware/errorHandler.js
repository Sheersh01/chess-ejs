const logger = require("../config/logger");

const notFound = (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ success: false, error: "Resource not found" });
  }
  next();
};

const errorHandler = (err, req, res, _next) => {
  const status = err.statusCode || err.status || 500;
  logger.error({ err, path: req.path, status }, "Request error");

  if (req.path.startsWith("/api/")) {
    // Never leak internal error details for server errors in production.
    const hideDetails = status >= 500 && process.env.NODE_ENV === "production";
    return res.status(status).json({
      success: false,
      error: hideDetails
        ? "Internal server error"
        : err.message || "Internal server error",
      ...(!hideDetails && err.errors && { errors: err.errors }),
    });
  }

  res.status(status >= 400 ? status : 500).send("Something went wrong");
};

module.exports = { notFound, errorHandler };
