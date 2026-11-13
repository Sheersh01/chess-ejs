const mongoose = require("mongoose");

const gameSchema = new mongoose.Schema(
  {
    gameId: {
      type: String,
      required: true,
      unique: true,
    },
    whiteUserId: {
      type: String,
      required: true,
    },
    blackUserId: {
      type: String,
      required: true,
    },
    whiteUsername: { type: String, default: "" },
    blackUsername: { type: String, default: "" },
    mode: {
      type: String,
      enum: ["online", "bot"],
      default: "online",
    },
    rated: { type: Boolean, default: false },
    timeControl: { type: String, default: "10+0" },
    status: {
      type: String,
      enum: ["active", "completed", "abandoned"],
      default: "active",
      index: true,
    },
    fen: { type: String, default: "" },
    pgn: { type: String, default: "" },
    moveCount: { type: Number, default: 0 },
    clocks: {
      whiteMs: { type: Number },
      blackMs: { type: Number },
    },
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

// "My games" queries: filter by player + status, newest first.
gameSchema.index({ whiteUserId: 1, status: 1, finishedAt: -1 });
gameSchema.index({ blackUserId: 1, status: 1, finishedAt: -1 });

module.exports = mongoose.model("Game", gameSchema);
