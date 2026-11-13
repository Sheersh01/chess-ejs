const express = require("express");
const { protect } = require("../middleware/auth");
const { validateForm } = require("../middleware/validate");
const { changePasswordValidation } = require("../validators/authValidators");
const profileController = require("../controllers/profileController");
const gameStats = require("../stats/gameStats");
const gameManager = require("../game/gameManager");

const router = express.Router();

router.get("/", protect, (req, res) => {
  res.render("index", { user: req.user });
});

router.get("/profile", protect, profileController.getProfilePage);
router.post("/profile", protect, profileController.updateProfile);
router.post(
  "/profile/password",
  protect,
  changePasswordValidation,
  validateForm("profile", [], (req) => ({ user: req.user, success: null })),
  profileController.changePassword,
);
router.post("/profile/delete", protect, profileController.deleteAccount);

router.get("/stats", (req, res) => {
  res.json(
    gameStats.getStats(
      gameManager.getActiveGameCount(),
      gameManager.getActivePlayerCount(),
    ),
  );
});

module.exports = router;
