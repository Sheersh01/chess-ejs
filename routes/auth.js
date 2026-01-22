const express = require("express");
const router = express.Router();
const {
  register,
  login,
  logout,
  getMe,
  guestLogin,
} = require("../controllers/authController");
const { protect } = require("../middleware/auth");

// Render login page
router.get("/login", (req, res) => {
  res.render("login", { error: null, email: "" });
});

// Render register page
router.get("/register", (req, res) => {
  res.render("register", { error: null, username: "", email: "" });
});

// Auth routes
router.post("/register", register);
router.post("/login", login);
router.post("/guest", guestLogin);
router.get("/logout", logout);
router.get("/me", protect, getMe);

module.exports = router;
