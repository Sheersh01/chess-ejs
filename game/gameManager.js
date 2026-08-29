const { Chess } = require("chess.js");
const gameStats = require("../stats/gameStats").stats;

const games = new Map();
const socketToGame = new Map();
const userIdToGame = new Map();

const isSocketPlayer = (playerId) =>
  typeof playerId === "string" && !playerId.startsWith("bot_");

const isHumanUserId = (userId) =>
  typeof userId === "string" && userId !== "bot_engine" && !userId.startsWith("bot_");

const generateGameId = () =>
  `game_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const trackUserGame = (userId, gameId) => {
  if (isHumanUserId(userId)) {
    userIdToGame.set(String(userId), gameId);
  }
};

const untrackUserGame = (userId) => {
  if (isHumanUserId(userId)) {
    userIdToGame.delete(String(userId));
  }
};

const createGame = (white, black, whiteUserId, blackUserId, options = {}) => {
  const id = generateGameId();
  const isBotGame = Boolean(options.isBotGame);
  const game = {
    id,
    chess: new Chess(),
    players: { white, black },
    userIds: { white: whiteUserId, black: blackUserId },
    playerMeta: options.playerMeta || {
      white: {},
      black: {},
    },
    initialRatings: options.initialRatings || {
      white: 1200,
      black: 1200,
    },
    isBotGame,
    isFinished: false,
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
    timerState: {
      remainingMs: { white: 600000, black: 600000 },
      activeColor: null,
      lastUpdatedAt: null,
      lastBroadcastSeconds: { white: 600, black: 600 },
      lowTimeNotified: { white: false, black: false },
      running: false,
    },
    scores: { w: 0, b: 0 },
    capturedPieces: { white: [], black: [] },
    moveHistory: [],
    timerInterval: null,
    disconnectState: { white: false, black: false },
    disconnectTimers: { white: null, black: null },
  };

  games.set(id, game);
  if (isSocketPlayer(white)) {
    socketToGame.set(white, id);
  }
  if (isSocketPlayer(black)) {
    socketToGame.set(black, id);
  }
  trackUserGame(whiteUserId, id);
  trackUserGame(blackUserId, id);
  gameStats.totalGames++;

  return game;
};

const getGameBySocket = (socketId) => {
  const gameId = socketToGame.get(socketId);
  return gameId ? games.get(gameId) : null;
};

const getGameByUserId = (userId) => {
  const gameId = userIdToGame.get(String(userId));
  return gameId ? games.get(gameId) : null;
};

const clearDisconnectTimer = (game, color) => {
  if (game.disconnectTimers?.[color]) {
    clearTimeout(game.disconnectTimers[color]);
    game.disconnectTimers[color] = null;
  }
  if (game.disconnectState) {
    game.disconnectState[color] = false;
  }
};

const markPlayerDisconnected = (game, color) => {
  if (game.disconnectState) {
    game.disconnectState[color] = true;
  }
};

const reconnectPlayer = (userId, newSocketId) => {
  const game = getGameByUserId(userId);
  if (!game || game.isFinished) {
    return null;
  }

  const userKey = String(userId);
  let reconnectedColor = null;

  if (String(game.userIds.white) === userKey && isSocketPlayer(game.players.white)) {
    const oldSocket = game.players.white;
    if (socketToGame.get(oldSocket) === game.id) {
      socketToGame.delete(oldSocket);
    }
    game.players.white = newSocketId;
    socketToGame.set(newSocketId, game.id);
    reconnectedColor = "white";
    clearDisconnectTimer(game, "white");
  } else if (
    String(game.userIds.black) === userKey &&
    isSocketPlayer(game.players.black)
  ) {
    const oldSocket = game.players.black;
    if (socketToGame.get(oldSocket) === game.id) {
      socketToGame.delete(oldSocket);
    }
    game.players.black = newSocketId;
    socketToGame.set(newSocketId, game.id);
    reconnectedColor = "black";
    clearDisconnectTimer(game, "black");
  } else {
    return null;
  }

  return { game, reconnectedColor };
};

const getActivePlayerCount = () => {
  const uniqueUsers = new Set();
  for (const game of games.values()) {
    if (!game.isFinished) {
      if (isHumanUserId(game.userIds.white))
        uniqueUsers.add(String(game.userIds.white));
      if (isHumanUserId(game.userIds.black))
        uniqueUsers.add(String(game.userIds.black));
    }
  }
  return uniqueUsers.size;
};

const getActiveGameCount = () =>
  Array.from(games.values()).filter((game) => !game.isFinished).length;

const cleanupGame = (gameId) => {
  const game = games.get(gameId);
  if (game) {
    if (game.timerInterval) clearInterval(game.timerInterval);
    if (game.bot?.pendingMoveTimeout) {
      clearTimeout(game.bot.pendingMoveTimeout);
      game.bot.pendingMoveTimeout = null;
    }
    clearDisconnectTimer(game, "white");
    clearDisconnectTimer(game, "black");

    if (isSocketPlayer(game.players.white)) {
      if (socketToGame.get(game.players.white) === gameId) {
        socketToGame.delete(game.players.white);
      }
    }
    if (isSocketPlayer(game.players.black)) {
      if (socketToGame.get(game.players.black) === gameId) {
        socketToGame.delete(game.players.black);
      }
    }

    untrackUserGame(game.userIds.white);
    untrackUserGame(game.userIds.black);
    games.delete(gameId);
  }
};

module.exports = {
  games,
  socketToGame,
  userIdToGame,
  createGame,
  getGameBySocket,
  getGameByUserId,
  reconnectPlayer,
  clearDisconnectTimer,
  markPlayerDisconnected,
  getActivePlayerCount,
  getActiveGameCount,
  cleanupGame,
  isSocketPlayer,
};
