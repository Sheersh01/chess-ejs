const mongoose = require("mongoose");

const gameSchema = new mongoose.Schema(
  {
    gameId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    whiteUserId: {
      type: String,
      required: true,
      index: true,
    },
    blackUserId: {
      type: String,
      required: true,
      index: true,
    },
    whiteUsername: { type: String, default: "" },
    blackUsername: { type: String, default: "" },
    mode: {
      type: String,
      enum: ["online", "bot"],
      default: "online",
    },
    status: {
      type: String,
      enum: ["active", "completed", "abandoned"],
      default: "active",
      index: true,
    },
    fen: { type: String, default: "" },
    pgn: { type: String, default: "" },
    moveCount: { type: Number, default: 0 },
    result: {
      type: String,
      enum: ["white", "black", "draw", null],
      default: null,
    },
    reason: { type: String, default: "" },
    whiteRatingBefore: { type: Number },
    blackRatingBefore: { type: Number },
    whiteRatingAfter: { type: Number },
    blackRatingAfter: { type: Number },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Game", gameSchema);
