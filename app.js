const { isProduction } = require("./config/env"); // loads .env first
const express = require("express");
const cookieParser = require("cookie-parser");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const pinoHttp = require("pino-http");
const logger = require("./config/logger");
const originCheck = require("./middleware/originCheck");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const contentSecurityPolicy = {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "https://cdnjs.cloudflare.com"],
    scriptSrcAttr: ["'none'"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
    imgSrc: ["'self'", "data:"],
    mediaSrc: ["'self'"],
    connectSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'self'"],
    upgradeInsecureRequests: isProduction() ? [] : null,
  },
};

const createApp = () => {
  const app = express();

  // Behind a single reverse proxy (Railway/Docker ingress): trust it for client IPs.
  if (isProduction()) app.set("trust proxy", 1);

  app.use(helmet({ contentSecurityPolicy }));
  app.use(pinoHttp({ logger, autoLogging: process.env.NODE_ENV !== "test" }));
  app.use(express.json({ limit: "20kb" }));
  app.use(express.urlencoded({ extended: true, limit: "20kb" }));
  app.use(cookieParser());

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: "Too many requests, please try again later" },
  });
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: "Too many requests, please try again later" },
  });

  app.use(["/auth/login", "/auth/register", "/auth/guest"], authLimiter);
  app.use(
    ["/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/auth/guest"],
    authLimiter,
  );
  app.use("/api/v1/profile/password", authLimiter);
  app.use("/api/", apiLimiter);

  app.use(express.static(path.join(__dirname, "public")));

  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));

  // CSRF defence for every state-changing request.
  app.use(originCheck);

  app.use(require("./routes/health"));
  app.use("/api/v1", require("./routes/api"));
  app.use("/auth", require("./routes/auth"));
  app.use("/", require("./routes/viewRoutes"));

  app.use(notFound);
  app.use(errorHandler);

  return app;
};

module.exports = createApp();
module.exports.createApp = createApp;
