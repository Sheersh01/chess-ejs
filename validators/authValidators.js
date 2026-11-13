const { body } = require("express-validator");

const PASSWORD_MIN = 8;

const usernameRule = () =>
  body("username")
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage("Username must be 3-20 characters")
    .matches(/^[A-Za-z0-9_-]+$/)
    .withMessage("Username may only contain letters, numbers, underscores and hyphens");

const newPasswordRule = (field) =>
  body(field)
    .isString()
    .isLength({ min: PASSWORD_MIN, max: 72 })
    .withMessage(`Password must be ${PASSWORD_MIN}-72 characters`);

const registerValidation = [
  usernameRule(),
  body("email")
    .trim()
    .isEmail()
    .withMessage("Valid email is required")
    .normalizeEmail(),
  newPasswordRule("password"),
];

const loginValidation = [
  body("email")
    .trim()
    .isEmail()
    .withMessage("Valid email is required")
    .normalizeEmail(),
  body("password").isString().notEmpty().withMessage("Password is required"),
];

const changePasswordValidation = [
  body("currentPassword")
    .isString()
    .notEmpty()
    .withMessage("Current password is required"),
  newPasswordRule("newPassword"),
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
  PASSWORD_MIN,
  registerValidation,
  loginValidation,
  changePasswordValidation,
  profileValidation,
};
