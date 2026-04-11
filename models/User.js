const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "Please provide a username"],
      unique: true,
      trim: true,
      minlength: [3, "Username must be at least 3 characters"],
      maxlength: [20, "Username cannot exceed 20 characters"],
    },
    email: {
      type: String,
      required: [true, "Please provide an email"],
      unique: true,
      lowercase: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        "Please provide a valid email",
      ],
    },
    password: {
      type: String,
      required: [true, "Please provide a password"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
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

// Generate JWT token
userSchema.methods.getSignedJwtToken = function () {
  return jwt.sign({ id: this._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });
};

// Calculate win rate
userSchema.virtual("winRate").get(function () {
  if (this.gamesPlayed === 0) return 0;
  return ((this.wins / this.gamesPlayed) * 100).toFixed(2);
});

// Update rating based on game result
userSchema.methods.updateRating = function (opponentRating, result) {
  const K = 32; // K-factor for ELO rating
  const expectedScore =
    1 / (1 + Math.pow(10, (opponentRating - this.rating) / 400));

  let actualScore;
  if (result === "win") {
    actualScore = 1;
    this.wins += 1;
    this.winStreak += 1;
    if (this.winStreak > this.bestWinStreak) {
      this.bestWinStreak = this.winStreak;
    }
  } else if (result === "loss") {
    actualScore = 0;
    this.losses += 1;
    this.winStreak = 0;
  } else {
    actualScore = 0.5;
    this.draws += 1;
    this.winStreak = 0;
  }

  this.rating = Math.round(this.rating + K * (actualScore - expectedScore));
  this.gamesPlayed += 1;
  this.lastActive = Date.now();
};

userSchema.methods.addGameHistoryEntry = function (entry) {
  this.gameHistory.unshift(entry);
  if (this.gameHistory.length > 20) {
    this.gameHistory = this.gameHistory.slice(0, 20);
  }
};

module.exports = mongoose.model("User", userSchema);
