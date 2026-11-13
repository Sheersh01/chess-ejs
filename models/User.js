const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "Please provide a username"],
      unique: true,
      trim: true,
      minlength: [3, "Username must be at least 3 characters"],
      maxlength: [20, "Username cannot exceed 20 characters"],
      match: [
        /^[A-Za-z0-9_-]+$/,
        "Username may only contain letters, numbers, underscores and hyphens",
      ],
    },
    email: {
      type: String,
      required: [true, "Please provide an email"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Please provide a password"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },
    // Incremented on password change; tokens carrying an older version are rejected.
    tokenVersion: {
      type: Number,
      default: 0,
    },
    passwordChangedAt: {
      type: Date,
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: [30, "Display name cannot exceed 30 characters"],
      default: "",
    },
    settings: {
      boardLight: {
        type: String,
        default: "#f0d9b5",
        match: [/^#[0-9A-Fa-f]{6}$/, "Board light color must be a hex code"],
      },
      boardDark: {
        type: String,
        default: "#b58863",
        match: [/^#[0-9A-Fa-f]{6}$/, "Board dark color must be a hex code"],
      },
      hintColor: {
        type: String,
        default: "#14551e",
        match: [/^#[0-9A-Fa-f]{6}$/, "Hint color must be a hex code"],
      },
    },
    rating: {
      type: Number,
      default: 1200,
      min: 0,
    },
    gamesPlayed: {
      type: Number,
      default: 0,
    },
    wins: {
      type: Number,
      default: 0,
    },
    losses: {
      type: Number,
      default: 0,
    },
    draws: {
      type: Number,
      default: 0,
    },
    winStreak: {
      type: Number,
      default: 0,
    },
    bestWinStreak: {
      type: Number,
      default: 0,
    },
    lastActive: {
      type: Date,
      default: Date.now,
    },
    gameHistory: [
      {
        gameId: {
          type: String,
        },
        opponent: {
          type: String,
          required: true,
          trim: true,
          maxlength: 40,
        },
        mode: {
          type: String,
          enum: ["online", "bot"],
          required: true,
        },
        color: {
          type: String,
          enum: ["white", "black"],
          required: true,
        },
        result: {
          type: String,
          enum: ["win", "loss", "draw"],
          required: true,
        },
        reason: {
          type: String,
          default: "",
          maxlength: 120,
        },
        moves: {
          type: Number,
          default: 0,
          min: 0,
        },
        rated: {
          type: Boolean,
          default: true,
        },
        ratingBefore: {
          type: Number,
          min: 0,
        },
        ratingAfter: {
          type: Number,
          min: 0,
        },
        playedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  },
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Calculate win rate
userSchema.virtual("winRate").get(function () {
  if (this.gamesPlayed === 0) return 0;
  return ((this.wins / this.gamesPlayed) * 100).toFixed(2);
});

userSchema.index({ rating: -1 });

module.exports = mongoose.model("User", userSchema);
