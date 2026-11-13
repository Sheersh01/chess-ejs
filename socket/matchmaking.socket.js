const gameManager = require("../game/gameManager");
const botManager = require("../game/botManager");
const { startGameClock } = require("../game/gameLifecycle");
const { scheduleBotMove } = require("../game/moveService");
const { normalizeTimeControl } = require("../game/timeControls");
const { MatchmakingQueue } = require("../game/matchmakingQueue");
const { createGameRecord } = require("../services/gamePersistence");
const { isDbReady } = require("../config/database");
const User = require("../models/User");
const logger = require("../config/logger");

const BOT_SOCKET_ID = "bot_engine";
const BOT_USER_ID = "bot_engine";
const BOT_USERNAME = "Chess Bot";
const BOT_DISPLAY_RATING = 1200;
const COUNTDOWN_SECONDS = Number(process.env.COUNTDOWN_SECONDS ?? 3);
const COUNTDOWN_TICK_MS = Number(process.env.COUNTDOWN_TICK_MS) || 1000;
const SWEEP_INTERVAL_MS = 2000;

const queue = new MatchmakingQueue();

const getUserId = (socket) => socket.user?._id || socket.user?.id;

const normalizeColorPreference = (value) => {
  if (value === "white" || value === "w") return "w";
  if (value === "black" || value === "b") return "b";
  return "random";
};

const assignColors = (player1, player2) => {
  const pref1 = player1.colorPreference || "random";
  const pref2 = player2.colorPreference || "random";
  if (pref1 === "w" || pref2 === "b")
    return { whitePlayer: player1, blackPlayer: player2 };
  if (pref1 === "b" || pref2 === "w")
    return { whitePlayer: player2, blackPlayer: player1 };
  return Math.random() < 0.5
    ? { whitePlayer: player1, blackPlayer: player2 }
    : { whitePlayer: player2, blackPlayer: player1 };
};

const playerMeta = (player) => ({
  username: player.username,
  displayName: player.displayName || player.username,
});

const BOT_META = { username: BOT_USERNAME, displayName: BOT_USERNAME };

/** Ratings change after every game; never trust the value cached at connect time. */
const refreshRating = async (socket) => {
  const userId = getUserId(socket);
  if (socket.user?.isGuest || !isDbReady() || !gameManager.isRegisteredUserId(userId)) {
    return socket.user?.rating ?? 1200;
  }
  const fresh = await User.findById(userId).select("rating").lean();
  if (fresh) socket.user.rating = fresh.rating;
  return socket.user.rating;
};

const buildPlayer = (socket, payload, rating) => ({
  socketId: socket.id,
  userId: getUserId(socket),
  username: socket.user.username,
  displayName: socket.user.displayName || socket.user.username,
  rating,
  colorPreference: normalizeColorPreference(payload.colorPreference),
  timeControl: normalizeTimeControl(payload.timeControl),
  joinedAt: Date.now(),
});

const blockedReason = (socket, userId) => {
  if (gameManager.isUserInActiveGame(userId)) {
    return "This account is already playing a game in another tab or window.";
  }
  if (queue.hasUser(userId) && !queue.hasSocket(socket.id)) {
    return "This account is already searching for a match in another tab or window.";
  }
  return null;
};

/** Countdown, then persist the record and start the clock (and the bot, if any). */
const runCountdown = (io, game, room) => {
  io.to(room).emit("startCountdown");
  let countdown = COUNTDOWN_SECONDS;

  game.countdownInterval = setInterval(async () => {
    if (game.isFinished) {
      clearInterval(game.countdownInterval);
      game.countdownInterval = null;
      return;
    }

    io.to(room).emit("countdownTick", countdown);
    countdown--;
    if (countdown >= 0) return;

    clearInterval(game.countdownInterval);
    game.countdownInterval = null;

    await createGameRecord(game);
    if (game.isFinished) return;

    startGameClock(game, io);
    io.to(game.id).emit("gameStart");
    io.to(game.id).emit("boardstate", game.chess.fen());
    io.to(game.id).emit("turnChange", game.chess.turn());
    scheduleBotMove(game, io);

    const white = game.playerMeta.white.username;
    const black = game.playerMeta.black.username;
    logger.info(
      { gameId: game.id, timeControl: game.clock.timeControl },
      `Game started: ${white} (white) vs ${black} (black)`,
    );
  }, COUNTDOWN_TICK_MS);
};

const startGame = (io, player1, player2) => {
  const socket1 = io.sockets.sockets.get(player1.socketId);
  const socket2 = io.sockets.sockets.get(player2.socketId);
  if (!socket1 || !socket2) {
    // Someone left between pairing and start: put the other player back in line.
    const stillHere = socket1 ? player1 : socket2 ? player2 : null;
    if (stillHere) queue.add(stillHere);
    return null;
  }

  const { whitePlayer, blackPlayer } = assignColors(player1, player2);
  const game = gameManager.createGame(
    whitePlayer.socketId,
    blackPlayer.socketId,
    whitePlayer.userId,
    blackPlayer.userId,
    {
      playerMeta: { white: playerMeta(whitePlayer), black: playerMeta(blackPlayer) },
      initialRatings: { white: whitePlayer.rating, black: blackPlayer.rating },
      timeControl: whitePlayer.timeControl,
    },
  );

  io.to(whitePlayer.socketId).emit("playerRole", "w");
  io.to(blackPlayer.socketId).emit("playerRole", "b");
  socket1.join(game.id);
  socket2.join(game.id);
  runCountdown(io, game, game.id);
  return game;
};

const startBotGame = (io, socket, player, settings) => {
  const humanColor =
    player.colorPreference === "w" || player.colorPreference === "b"
      ? player.colorPreference
      : Math.random() < 0.5
        ? "w"
        : "b";
  const botColor = humanColor === "w" ? "b" : "w";
  const humanIsWhite = humanColor === "w";

  const game = gameManager.createGame(
    humanIsWhite ? player.socketId : BOT_SOCKET_ID,
    humanIsWhite ? BOT_SOCKET_ID : player.socketId,
    humanIsWhite ? player.userId : BOT_USER_ID,
    humanIsWhite ? BOT_USER_ID : player.userId,
    {
      playerMeta: {
        white: humanIsWhite ? playerMeta(player) : BOT_META,
        black: humanIsWhite ? BOT_META : playerMeta(player),
      },
      initialRatings: {
        white: humanIsWhite ? player.rating : BOT_DISPLAY_RATING,
        black: humanIsWhite ? BOT_DISPLAY_RATING : player.rating,
      },
      isBotGame: true,
      botColor,
      humanColor,
      difficulty: settings.difficulty,
      personality: settings.personality,
      thinkTimeMs: settings.thinkTimeMs,
      timeControl: player.timeControl,
    },
  );

  socket.emit("playerRole", humanColor);
  socket.join(game.id);
  runCountdown(io, game, game.id);
  return game;
};

const register = (io) => {
  const sweepTimer = setInterval(() => {
    const pairs = queue.sweep((socketId) => io.sockets.sockets.has(socketId));
    for (const [a, b] of pairs) {
      logger.info(`Match found after waiting: ${a.username} vs ${b.username}`);
      startGame(io, a, b);
    }
  }, SWEEP_INTERVAL_MS);
  sweepTimer.unref?.();

  io.on("connection", (socket) => {
    socket.on("findMatch", async (payload = {}) => {
      try {
        const userId = getUserId(socket);
        if (queue.hasSocket(socket.id)) {
          socket.emit("waitingForMatch");
          return;
        }

        let reason = blockedReason(socket, userId);
        if (reason) {
          socket.emit("matchmakingBlocked", { message: reason });
          return;
        }

        const rating = await refreshRating(socket);
        // State may have changed while we awaited the database.
        reason = blockedReason(socket, userId);
        if (reason || queue.hasSocket(socket.id) || !socket.connected) {
          if (reason) socket.emit("matchmakingBlocked", { message: reason });
          return;
        }

        const player = buildPlayer(socket, payload || {}, rating);
        const opponent = queue.takeMatchFor(player);
        if (opponent) {
          logger.info(`Match found: ${player.username} vs ${opponent.username}`);
          startGame(io, player, opponent);
        } else {
          queue.add(player);
          socket.emit("waitingForMatch");
        }
      } catch (error) {
        logger.error({ err: error }, "findMatch failed");
        socket.emit("matchmakingBlocked", {
          message: "Matchmaking failed, try again.",
        });
      }
    });

    socket.on("playBot", async (payload = {}) => {
      try {
        const userId = getUserId(socket);
        const reason = blockedReason(socket, userId);
        if (reason) {
          socket.emit("matchmakingBlocked", { message: reason });
          return;
        }
        queue.remove(socket.id);

        const rating = await refreshRating(socket);
        if (gameManager.isUserInActiveGame(userId) || !socket.connected) return;

        socket.emit("waitingForBotMatch");
        const difficulty = botManager.normalizeDifficulty(payload?.difficulty);
        const config = botManager.getDifficultyConfig(difficulty);
        const player = buildPlayer(socket, payload || {}, rating);
        startBotGame(io, socket, player, {
          difficulty,
          personality: botManager.normalizePersonality(payload?.personality),
          thinkTimeMs: config.thinkTimeMs,
        });
      } catch (error) {
        logger.error({ err: error }, "playBot failed");
        socket.emit("matchmakingBlocked", { message: "Could not start bot game." });
      }
    });

    socket.on("cancelMatchmaking", () => {
      const removed = queue.remove(socket.id);
      socket.emit("matchmakingCancelled", { cancelled: removed });
    });

    socket.on("disconnect", () => {
      queue.remove(socket.id);
    });
  });

  return () => {
    clearInterval(sweepTimer);
    queue.clear();
  };
};

module.exports = register;
module.exports.queue = queue;
module.exports.startGame = startGame;
