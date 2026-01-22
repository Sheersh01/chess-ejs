const express = require("express");
const dotenv = require("dotenv");
const cookieParser = require("cookie-parser");
const path = require("path");

dotenv.config();

const connectDB = require("./config/database");
connectDB();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// View engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Auth middleware
const { isAuthenticated, protect } = require("./middleware/auth");
app.use(isAuthenticated);

// Routes
app.use("/auth", require("./routes/auth"));
app.use("/", require("./routes/viewRoutes"));

module.exports = app;
