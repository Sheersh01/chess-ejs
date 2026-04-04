const { Chess } = require("chess.js");
const gameStats = require("../stats/gameStats").stats;

const games = new Map();
const socketToGame = new Map();

const isSocketPlayer = (playerId) =>
  typeof playerId === "string" && !playerId.startsWith("bot_");

const generateGameId = () =>
  `game_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const createGame = (white, black, whiteUserId, blackUserId, options = {}) => {
  const id = generateGameId();
  const isBotGame = Boolean(options.isBotGame);
  const game = {
    id,
    chess: new Chess(),
    players: { white, black },
    userIds: { white: whiteUserId, black: blackUserId },
    isBotGame,
    bot:
      isBotGame && options.botColor
        ? {
            color: options.botColor,
            thinkTimeMs: options.thinkTimeMs || 500,
            difficulty: options.difficulty || "medium",
            personality: options.personality || "positional",
            humanColor: options.humanColor || "w",
            pendingMoveTimeout: null,
          }
        : null,
    timers: { white: 600, black: 600 },
    scores: { w: 0, b: 0 },
    capturedPieces: { white: [], black: [] },
    moveHistory: [],
    timerInterval: null,
  };

  games.set(id, game);
  if (isSocketPlayer(white)) {
    socketToGame.set(white, id);
  }
  if (isSocketPlayer(black)) {
    socketToGame.set(black, id);
  }
  gameStats.totalGames++;

  return game;
};

const getGameBySocket = (socketId) => {
  const gameId = socketToGame.get(socketId);
  return gameId ? games.get(gameId) : null;
};

const cleanupGame = (gameId) => {
  const game = games.get(gameId);
  if (game) {
    if (game.timerInterval) clearInterval(game.timerInterval);
    if (game.bot?.pendingMoveTimeout) {
      clearTimeout(game.bot.pendingMoveTimeout);
      game.bot.pendingMoveTimeout = null;
    }
    // Remove socket mappings
    if (isSocketPlayer(game.players.white)) {
      socketToGame.delete(game.players.white);
    }
    if (isSocketPlayer(game.players.black)) {
      socketToGame.delete(game.players.black);
    }
    // Remove game
    games.delete(gameId);
  }
};

module.exports = {
  games,
  socketToGame,
  createGame,
  getGameBySocket,
  cleanupGame,
};
