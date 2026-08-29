const express = require("express");
const dotenv = require("dotenv");
const cookieParser = require("cookie-parser");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const pinoHttp = require("pino-http");
const logger = require("./config/logger");
const { notFound, errorHandler } = require("./middleware/errorHandler");

dotenv.config();

const connectDB = require("./config/database");
connectDB();

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);
app.use(pinoHttp({ logger }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests, please try again later" },
});

app.use("/auth", authLimiter);
app.use("/api/v1/auth", authLimiter);

app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const { isAuthenticated } = require("./middleware/auth");
app.use(isAuthenticated);

app.use(require("./routes/health"));
app.use("/api/v1", require("./routes/api"));
app.use("/auth", require("./routes/auth"));
app.use("/", require("./routes/viewRoutes"));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
