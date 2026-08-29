const User = require("../models/User");
const Game = require("../models/Game");
const gameManager = require("../game/gameManager");
const gameStats = require("../stats/gameStats");

const serializeUser = (user) => ({
  id: user._id || user.id,
  username: user.username,
  displayName: user.displayName || user.username,
  email: user.email,
  rating: user.rating,
  gamesPlayed: user.gamesPlayed,
  wins: user.wins,
  losses: user.losses,
  draws: user.draws,
  winStreak: user.winStreak,
  bestWinStreak: user.bestWinStreak,
  settings: user.settings,
  isGuest: user.isGuest || false,
  gameHistory: user.gameHistory,
});

exports.getMe = async (req, res) => {
  res.json({ success: true, data: serializeUser(req.user) });
};

exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    res.json({
      success: true,
      data: {
        id: user._id,
        username: user.username,
        displayName: user.displayName || user.username,
        rating: user.rating,
        gamesPlayed: user.gamesPlayed,
        wins: user.wins,
        losses: user.losses,
        draws: user.draws,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error" });
  }
};

exports.getLeaderboard = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const users = await User.find()
      .select("username displayName rating wins losses draws gamesPlayed")
      .sort({ rating: -1 })
      .limit(limit);

    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error" });
  }
};

exports.getStats = (req, res) => {
  res.json({
    success: true,
    data: gameStats.getStats(
      gameManager.getActiveGameCount(),
      gameManager.getActivePlayerCount(),
    ),
  });
};

exports.listGames = async (req, res) => {
  try {
    const userId = String(req.user._id || req.user.id);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const skip = (page - 1) * limit;

    const filter = {
      status: "completed",
      $or: [{ whiteUserId: userId }, { blackUserId: userId }],
    };

    const [games, total] = await Promise.all([
      Game.find(filter).sort({ finishedAt: -1 }).skip(skip).limit(limit),
      Game.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: games,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error" });
  }
};

exports.getGameById = async (req, res) => {
  try {
    const game = await Game.findOne({ gameId: req.params.id });
    if (!game) {
      return res.status(404).json({ success: false, error: "Game not found" });
    }

    const userId = String(req.user._id || req.user.id);
    if (game.whiteUserId !== userId && game.blackUserId !== userId) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    res.json({ success: true, data: game });
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error" });
  }
};
