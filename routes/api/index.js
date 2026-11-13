const express = require("express");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("../../config/swagger");
const { protectApi } = require("../../middleware/auth");
const apiController = require("../../controllers/apiController");
const apiAuthController = require("../../controllers/apiAuthController");
const validate = require("../../middleware/validate");
const {
  registerValidation,
  loginValidation,
  changePasswordValidation,
  profileValidation,
} = require("../../validators/authValidators");
const { updateProfile, deleteAccount } = require("../../controllers/profileController");

const router = express.Router();

/**
 * @openapi
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, email, password]
 *             properties:
 *               username: { type: string }
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       201:
 *         description: User registered
 */
router.post("/auth/register", registerValidation, validate, apiAuthController.register);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Auth]
 */
router.post("/auth/login", loginValidation, validate, apiAuthController.login);

/**
 * @openapi
 * /auth/guest:
 *   post:
 *     summary: Create guest session
 *     tags: [Auth]
 */
router.post("/auth/guest", apiAuthController.guestLogin);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Auth]
 */
router.post("/auth/logout", apiAuthController.logout);

/**
 * @openapi
 * /users/me:
 *   get:
 *     summary: Get current user
 *     tags: [Users]
 */
router.get("/users/me", protectApi, apiController.getMe);

/**
 * @openapi
 * /users/{id}:
 *   get:
 *     summary: Get public user profile
 *     tags: [Users]
 */
router.get("/users/:id", protectApi, apiController.getUserById);

/**
 * @openapi
 * /profile:
 *   post:
 *     summary: Update profile settings
 *     tags: [Users]
 */
router.post("/profile", protectApi, profileValidation, validate, updateProfile);

/**
 * @openapi
 * /profile/password:
 *   post:
 *     summary: Change password (revokes all existing tokens, returns a new one)
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword: { type: string, minLength: 8 }
 */
router.post(
  "/profile/password",
  protectApi,
  changePasswordValidation,
  validate,
  apiAuthController.changePassword,
);

router.post("/profile/delete", protectApi, deleteAccount);

/**
 * @openapi
 * /games:
 *   get:
 *     summary: List completed games for current user
 *     tags: [Games]
 */
router.get("/games", protectApi, apiController.listGames);

/**
 * @openapi
 * /games/{id}:
 *   get:
 *     summary: Get game by ID with PGN
 *     tags: [Games]
 */
router.get("/games/:id", protectApi, apiController.getGameById);

/**
 * @openapi
 * /leaderboard:
 *   get:
 *     summary: Top players by rating
 *     tags: [Stats]
 */
router.get("/leaderboard", protectApi, apiController.getLeaderboard);

/**
 * @openapi
 * /stats:
 *   get:
 *     summary: Global platform stats
 *     tags: [Stats]
 */
router.get("/stats", apiController.getStats);

// API docs are for development; opt in explicitly to expose them in production.
if (process.env.NODE_ENV !== "production" || process.env.ENABLE_API_DOCS === "true") {
  router.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

module.exports = router;
