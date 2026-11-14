const { Chess } = require("chess.js");
const search = require("./bot/search");
const pool = require("./bot/pool");

const randomLegalMove = (fen) => {
  const moves = new Chess(fen).moves({ verbose: true });
  if (moves.length === 0) return null;
  const move = moves[Math.floor(Math.random() * moves.length)];
  return { from: move.from, to: move.to, promotion: move.promotion };
};

/**
 * Off-main-thread bot move. Falls back to a random legal move if the worker
 * fails or exceeds its time budget, so a game can never stall on the bot.
 */
const getBotMoveAsync = async (fen, options = {}) => {
  const config = search.getDifficultyConfig(options.difficulty);
  const move = await pool.run(fen, options, config.budgetMs + 1000);
  return move || randomLegalMove(fen);
};

module.exports = {
  getBotMove: search.getBotMove,
  getBotMoveAsync,
  getDifficultyConfig: search.getDifficultyConfig,
  normalizeDifficulty: search.normalizeDifficulty,
  normalizePersonality: search.normalizePersonality,
  shutdown: () => pool.terminate(),
};
