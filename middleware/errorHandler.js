const logger = require("../config/logger");

const notFound = (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({
      success: false,
      error: "Resource not found",
    });
  }
  next();
};

const errorHandler = (err, req, res, _next) => {
  logger.error({ err, path: req.path }, "Request error");

  if (req.path.startsWith("/api/")) {
    const status = err.statusCode || err.status || 500;
    return res.status(status).json({
      success: false,
      error: err.message || "Internal server error",
      ...(err.errors && { errors: err.errors }),
    });
  }

  res.status(500).send("Internal server error");
};

module.exports = { notFound, errorHandler };
