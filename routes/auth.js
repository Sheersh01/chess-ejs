const express = require("express");
const authController = require("../controllers/authController");
const { validateForm } = require("../middleware/validate");
const { registerValidation, loginValidation } = require("../validators/authValidators");

const router = express.Router();

router.get("/login", authController.showLogin);
router.get("/register", authController.showRegister);

router.post(
  "/register",
  registerValidation,
  validateForm("register", ["username", "email"]),
  authController.register,
);
router.post(
  "/login",
  loginValidation,
  validateForm("login", ["email"]),
  authController.login,
);
router.post("/guest", authController.guestLogin);
router.post("/logout", authController.logout);

module.exports = router;
