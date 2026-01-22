const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");

router.get("/", protect, (req, res) => {
  res.render("index", { user: req.user });
});

router.get("/stats", (req, res) => {
  const gameStats = require("../stats/gameStats");
  res.json(gameStats.getStats());
});

module.exports = router;
