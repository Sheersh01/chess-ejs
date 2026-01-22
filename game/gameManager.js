const { Chess } = require("chess.js");
const gameStats = require("../stats/gameStats").stats;

const games = new Map();
const socketToGame = new Map();

const generateGameId = () =>
  `game_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const createGame = (white, black, whiteUserId, blackUserId) => {
  const id = generateGameId();
  const game = {
    id,
    chess: new Chess(),
    players: { white, black },
    userIds: { white: whiteUserId, black: blackUserId },
    timers: { white: 600, black: 600 },
    scores: { w: 0, b: 0 },
    capturedPieces: { white: [], black: [] },
    moveHistory: [],
    timerInterval: null,
  };

  games.set(id, game);
  socketToGame.set(white, id);
  socketToGame.set(black, id);
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
    // Remove socket mappings
    socketToGame.delete(game.players.white);
    socketToGame.delete(game.players.black);
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
