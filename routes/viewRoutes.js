const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const {
  getProfilePage,
  updateProfile,
  deleteAccount,
} = require("../controllers/profileController");
const gameStats = require("../stats/gameStats");
const gameManager = require("../game/gameManager");

router.get("/", protect, (req, res) => {
  res.render("index", { user: req.user });
});

router.get("/profile", protect, getProfilePage);
router.post("/profile", protect, updateProfile);
router.post("/profile/delete", protect, deleteAccount);

router.get("/stats", (req, res) => {
  res.json(
    gameStats.getStats(
      gameManager.getActiveGameCount(),
      gameManager.getActivePlayerCount(),
    ),
  );
});

module.exports = router;
