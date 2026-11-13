const { Chess } = require("chess.js");
const mongoose = require("mongoose");
const gameStats = require("../stats/gameStats").stats;
const timerManager = require("./timerManager");

// Single-instance, in-memory game store. All access goes through this module so a
// shared store (e.g. Redis) could replace it later without touching socket handlers.
const games = new Map();
const socketToGame = new Map();
const userIdToGame = new Map();

const BOT_ID_PREFIX = "bot_";
const GUEST_ID_PREFIX = "guest_";

const isSocketPlayer = (playerId) =>
  typeof playerId === "string" && !playerId.startsWith(BOT_ID_PREFIX);

const isBotId = (id) => typeof id === "string" && id.startsWith(BOT_ID_PREFIX);

const isGuestId = (id) => typeof id === "string" && id.startsWith(GUEST_ID_PREFIX);

const isHumanUserId = (userId) =>
  userId !== null && userId !== undefined && !isBotId(String(userId));

const isRegisteredUserId = (userId) =>
  isHumanUserId(userId) &&
  !isGuestId(String(userId)) &&
  mongoose.isValidObjectId(String(userId));

const generateGameId = () =>
  `game_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const trackUserGame = (userId, gameId) => {
  if (isHumanUserId(userId)) {
    userIdToGame.set(String(userId), gameId);
  }
};

const untrackUserGame = (userId, gameId) => {
  if (isHumanUserId(userId) && userIdToGame.get(String(userId)) === gameId) {
    userIdToGame.delete(String(userId));
  }
};

const createGame = (white, black, whiteUserId, blackUserId, options = {}) => {
  const id = generateGameId();
  const isBotGame = Boolean(options.isBotGame);
  const game = {
    id,
    chess: new Chess(),
    status: "countdown", // countdown -> active -> finished
    players: { white, black },
    userIds: { white: whiteUserId, black: blackUserId },
    playerMeta: options.playerMeta || { white: {}, black: {} },
    initialRatings: options.initialRatings || { white: 1200, black: 1200 },
    isBotGame,
    rated:
      !isBotGame && isRegisteredUserId(whiteUserId) && isRegisteredUserId(blackUserId),
    isFinished: false,
    bot:
      isBotGame && options.botColor
        ? {
            color: options.botColor,
            minDelayMs: options.thinkTimeMs || 500,
            difficulty: options.difficulty || "medium",
            personality: options.personality || "positional",
            humanColor: options.humanColor || "w",
            token: 0,
            thinking: false,
          }
        : null,
    clock: timerManager.createClock(options.timeControl),
    scores: { w: 0, b: 0 },
    capturedPieces: { white: [], black: [] },
    moveHistory: [],
    drawOffer: null,
    lastDrawOfferPly: { white: null, black: null },
    disconnectState: { white: false, black: false },
    disconnectTimers: { white: null, black: null },
    countdownInterval: null,
    cleanupTimeout: null,
  };

  games.set(id, game);
  if (isSocketPlayer(white)) socketToGame.set(white, id);
  if (isSocketPlayer(black)) socketToGame.set(black, id);
  trackUserGame(whiteUserId, id);
  trackUserGame(blackUserId, id);
  gameStats.totalGames++;

  return game;
};

const getGameBySocket = (socketId) => {
  const gameId = socketToGame.get(socketId);
  return gameId ? games.get(gameId) || null : null;
};

const getGameByUserId = (userId) => {
  const gameId = userIdToGame.get(String(userId));
  return gameId ? games.get(gameId) || null : null;
};

const isUserInActiveGame = (userId) => {
  const game = getGameByUserId(userId);
  return Boolean(game && !game.isFinished);
};

const getColorForSocket = (game, socketId) => {
  if (game.players.white === socketId) return "white";
  if (game.players.black === socketId) return "black";
  return null;
};

const getColorForUser = (game, userId) => {
  const key = String(userId);
  if (String(game.userIds.white) === key && isSocketPlayer(game.players.white)) {
    return "white";
  }
  if (String(game.userIds.black) === key && isSocketPlayer(game.players.black)) {
    return "black";
  }
  return null;
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
  game.disconnectState[color] = true;
};

const reconnectPlayer = (userId, newSocketId) => {
  const game = getGameByUserId(userId);
  if (!game || game.isFinished) {
    return null;
  }

  const color = getColorForUser(game, userId);
  if (!color) {
    return null;
  }

  const oldSocket = game.players[color];
  if (socketToGame.get(oldSocket) === game.id) {
    socketToGame.delete(oldSocket);
  }
  game.players[color] = newSocketId;
  socketToGame.set(newSocketId, game.id);
  clearDisconnectTimer(game, color);

  return { game, reconnectedColor: color };
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

const getActiveGameCount = () => {
  let count = 0;
  for (const game of games.values()) {
    if (!game.isFinished) count++;
  }
  return count;
};

const releaseResources = (game) => {
  timerManager.stop(game);
  if (game.countdownInterval) {
    clearInterval(game.countdownInterval);
    game.countdownInterval = null;
  }
  if (game.bot) {
    game.bot.token++;
  }
  clearDisconnectTimer(game, "white");
  clearDisconnectTimer(game, "black");
};

const cleanupGame = (gameId) => {
  const game = games.get(gameId);
  if (!game) {
    return;
  }

  releaseResources(game);
  if (game.cleanupTimeout) {
    clearTimeout(game.cleanupTimeout);
    game.cleanupTimeout = null;
  }

  for (const color of ["white", "black"]) {
    const socketId = game.players[color];
    if (isSocketPlayer(socketId) && socketToGame.get(socketId) === gameId) {
      socketToGame.delete(socketId);
    }
    untrackUserGame(game.userIds[color], gameId);
  }

  games.delete(gameId);
};

module.exports = {
  games,
  socketToGame,
  userIdToGame,
  createGame,
  getGameBySocket,
  getGameByUserId,
  isUserInActiveGame,
  getColorForSocket,
  getColorForUser,
  reconnectPlayer,
  clearDisconnectTimer,
  markPlayerDisconnected,
  getActivePlayerCount,
  getActiveGameCount,
  releaseResources,
  cleanupGame,
  isSocketPlayer,
  isBotId,
  isGuestId,
  isRegisteredUserId,
};
