const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

router.get("/ready", (req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  if (!dbReady) {
    return res.status(503).json({
      status: "not_ready",
      database: "disconnected",
    });
  }
  res.json({ status: "ready", database: "connected" });
});

module.exports = router;
