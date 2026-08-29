const { body } = require("express-validator");

const registerValidation = [
  body("username")
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage("Username must be 3-20 characters"),
  body("email").isEmail().withMessage("Valid email is required").normalizeEmail(),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),
];

const loginValidation = [
  body("email").isEmail().withMessage("Valid email is required").normalizeEmail(),
  body("password").notEmpty().withMessage("Password is required"),
];

const profileValidation = [
  body("displayName")
    .optional()
    .trim()
    .isLength({ max: 30 })
    .withMessage("Display name cannot exceed 30 characters"),
  body("boardLight")
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/)
    .withMessage("Board light color must be a hex code"),
  body("boardDark")
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/)
    .withMessage("Board dark color must be a hex code"),
  body("hintColor")
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/)
    .withMessage("Hint color must be a hex code"),
];

module.exports = {
  registerValidation,
  loginValidation,
  profileValidation,
};
