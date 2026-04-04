const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const {
  getProfilePage,
  updateProfile,
} = require("../controllers/profileController");

router.get("/", protect, (req, res) => {
  res.render("index", { user: req.user });
});

router.get("/profile", protect, getProfilePage);
router.post("/profile", protect, updateProfile);

router.get("/stats", (req, res) => {
  const gameStats = require("../stats/gameStats");
  res.json(gameStats.getStats());
});

module.exports = router;
