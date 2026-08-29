const gameManager = require("../game/gameManager");
const timerManager = require("../game/timerManager");
const botManager = require("../game/botManager");
const { createGameRecord } = require("../services/gamePersistence");
const logger = require("../config/logger");

// Matchmaking queue - stores waiting players
const matchmakingQueue = [];
const BOT_SOCKET_ID = "bot_engine";
const BOT_USER_ID = "bot_engine";
const BOT_USERNAME = "Chess Bot";
const toUserKey = (userId) => String(userId);

const isSameUser = (playerA, playerB) =>
  toUserKey(playerA.userId) === toUserKey(playerB.userId);

const removePlayerFromQueue = (socketId) => {
  const index = matchmakingQueue.findIndex((player) => player.socketId === socketId);
  if (index === -1) {
    return false;
  }

  matchmakingQueue.splice(index, 1);
  return true;
};

const isUserQueued = (userId) =>
  matchmakingQueue.some((player) => toUserKey(player.userId) === toUserKey(userId));

const isUserInActiveGame = (userId) => {
  const userKey = toUserKey(userId);

  return Array.from(gameManager.games.values()).some(
    (game) =>
      !game.isFinished &&
      (toUserKey(game.userIds.white) === userKey ||
        toUserKey(game.userIds.black) === userKey),
  );
};

const normalizeColorPreference = (value) => {
  if (value === "white" || value === "w") return "w";
  if (value === "black" || value === "b") return "b";
  return "random";
};

const canMatchColors = (playerA, playerB) => {
  const colorA = playerA.colorPreference || "random";
  const colorB = playerB.colorPreference || "random";

  if (colorA === "random" || colorB === "random") {
    return true;
  }

  return colorA !== colorB;
};

const assignColors = (player1, player2) => {
  const preference1 = player1.colorPreference || "random";
  const preference2 = player2.colorPreference || "random";

  if (preference1 === "w") {
    return { whitePlayer: player1, blackPlayer: player2 };
  }

  if (preference1 === "b") {
    return { whitePlayer: player2, blackPlayer: player1 };
  }

  if (preference2 === "w") {
    return { whitePlayer: player2, blackPlayer: player1 };
  }

  if (preference2 === "b") {
    return { whitePlayer: player1, blackPlayer: player2 };
  }

  return Math.random() < 0.5
    ? { whitePlayer: player1, blackPlayer: player2 }
    : { whitePlayer: player2, blackPlayer: player1 };
};

const parseBotSettings = (input = {}) => {
  const difficulty = botManager.normalizeDifficulty(input.difficulty);
  const personality = botManager.normalizePersonality(input.personality);
  const difficultyConfig = botManager.getDifficultyConfig(difficulty);

  return {
    difficulty,
    personality,
    depth: difficultyConfig.depth,
    thinkTimeMs: difficultyConfig.thinkTimeMs,
  };
};

const emitOpeningBotMoveIfNeeded = (game, io) => {
  if (!game?.isBotGame || !game.bot || game.bot.color !== "w") {
    return;
  }

  const delay = game.bot.thinkTimeMs || 500;

  const timeoutId = setTimeout(() => {
    try {
      const activeGame = gameManager.games.get(game.id);
      if (
        !activeGame ||
        activeGame.chess.turn() !== "w" ||
        activeGame.chess.isGameOver()
      ) {
        return;
      }

      const botMoveInput = botManager.getBotMove(activeGame.chess, {
        difficulty: activeGame.bot?.difficulty,
        personality: activeGame.bot?.personality,
        botColor: activeGame.bot?.color,
      });

      if (!botMoveInput) {
        return;
      }

      const botMove = activeGame.chess.move({
        from: botMoveInput.from,
        to: botMoveInput.to,
        promotion: botMoveInput.promotion,
      });

      if (!botMove) {
        return;
      }

      activeGame.moveHistory.push(botMove);

      io.to(activeGame.id).emit("move", botMove);
      io.to(activeGame.id).emit("boardstate", activeGame.chess.fen());
      io.to(activeGame.id).emit("moveHistory", activeGame.moveHistory);
      io.to(activeGame.id).emit("turnChange", activeGame.chess.turn());
      timerManager.syncToCurrentTurn(activeGame, io);
    } finally {
      if (game.bot?.pendingMoveTimeout === timeoutId) {
        game.bot.pendingMoveTimeout = null;
      }
    }
  }, delay);

  game.bot.pendingMoveTimeout = timeoutId;
};

// Helper function to find match with rating-based matchmaking
const findMatch = (newPlayer) => {
  const RATING_RANGE = 200; // Players within 200 rating points can be matched

  for (let i = 0; i < matchmakingQueue.length; i++) {
    const waitingPlayer = matchmakingQueue[i];

    // Don't match with yourself
    if (
      waitingPlayer.socketId === newPlayer.socketId ||
      isSameUser(waitingPlayer, newPlayer)
    ) {
      continue;
    }

    // Check if ratings are within acceptable range
    const ratingDiff = Math.abs(waitingPlayer.rating - newPlayer.rating);
    if (ratingDiff <= RATING_RANGE && canMatchColors(waitingPlayer, newPlayer)) {
      // Remove matched player from queue
      matchmakingQueue.splice(i, 1);
      return waitingPlayer;
    }
  }

  return null;
};

// Helper function to start game between two players
const startGame = (io, player1, player2) => {
  const { whitePlayer, blackPlayer } = assignColors(player1, player2);

  // Create the game
  const game = gameManager.createGame(
    whitePlayer.socketId,
    blackPlayer.socketId,
    whitePlayer.userId,
    blackPlayer.userId,
    {
      playerMeta: {
        white: {
          username: whitePlayer.username,
          displayName: whitePlayer.displayName || whitePlayer.username,
        },
        black: {
          username: blackPlayer.username,
          displayName: blackPlayer.displayName || blackPlayer.username,
        },
      },
      initialRatings: {
        white: whitePlayer.rating,
        black: blackPlayer.rating,
      },
    },
  );

  // Assign player roles
  io.to(whitePlayer.socketId).emit("playerRole", "w");
  io.to(blackPlayer.socketId).emit("playerRole", "b");

  // Join both players to game room
  io.sockets.sockets.get(whitePlayer.socketId)?.join(game.id);
  io.sockets.sockets.get(blackPlayer.socketId)?.join(game.id);

  // Notify players about countdown
  io.to(game.id).emit("startCountdown");

  // Countdown from 3
  let countdown = 3;
  const countdownInterval = setInterval(() => {
    io.to(game.id).emit("countdownTick", countdown);
    countdown--;

    if (countdown < 0) {
      clearInterval(countdownInterval);

      // Start the game
      io.to(game.id).emit("gameStart");
      io.to(game.id).emit("boardstate", game.chess.fen());
      io.to(game.id).emit("turnChange", game.chess.turn());

      // Start game timers
      timerManager.startTimer(game, io);

      createGameRecord(game);

      logger.info(
        `Game ${game.id} started between ${whitePlayer.username} (white) and ${blackPlayer.username} (black)`,
      );
    }
  }, 1000);
};

const startBotGame = (io, player, settings) => {
  const humanColor =
    settings.colorPreference === "w"
      ? "w"
      : settings.colorPreference === "b"
        ? "b"
        : Math.random() < 0.5
          ? "w"
          : "b";
  const botColor = humanColor === "w" ? "b" : "w";

  const game = gameManager.createGame(
    humanColor === "w" ? player.socketId : BOT_SOCKET_ID,
    humanColor === "w" ? BOT_SOCKET_ID : player.socketId,
    humanColor === "w" ? player.userId : BOT_USER_ID,
    humanColor === "w" ? BOT_USER_ID : player.userId,
    {
      playerMeta: {
        white:
          humanColor === "w"
            ? {
                username: player.username,
                displayName: player.displayName || player.username,
              }
            : {
                username: BOT_USERNAME,
                displayName: BOT_USERNAME,
              },
        black:
          humanColor === "w"
            ? {
                username: BOT_USERNAME,
                displayName: BOT_USERNAME,
              }
            : {
                username: player.username,
                displayName: player.displayName || player.username,
              },
      },
      initialRatings: {
        white: humanColor === "w" ? player.rating : 1200,
        black: humanColor === "w" ? 1200 : player.rating,
      },
      isBotGame: true,
      botColor,
      humanColor,
      difficulty: settings.difficulty,
      personality: settings.personality,
      thinkTimeMs: settings.thinkTimeMs,
    },
  );

  io.to(player.socketId).emit("playerRole", humanColor);

  io.sockets.sockets.get(player.socketId)?.join(game.id);

  io.to(player.socketId).emit("startCountdown");

  let countdown = 3;
  const countdownInterval = setInterval(() => {
    io.to(player.socketId).emit("countdownTick", countdown);
    countdown--;

    if (countdown < 0) {
      clearInterval(countdownInterval);

      io.to(player.socketId).emit("gameStart");
      io.to(player.socketId).emit("boardstate", game.chess.fen());
      io.to(player.socketId).emit("turnChange", game.chess.turn());

      timerManager.startTimer(game, io);
      emitOpeningBotMoveIfNeeded(game, io);

      createGameRecord(game);

      logger.info(
        `Bot game ${game.id} started for ${player.username} [${settings.difficulty}/${settings.personality}]`,
      );
    }
  }, 1000);
};

module.exports = (io) => {
  io.on("connection", (socket) => {
    logger.info(`Player connected: ${socket.user?.username} (${socket.id})`);

    socket.on("findMatch", (payload = {}) => {
      const userId = socket.user._id || socket.user.id;

      if (isUserInActiveGame(userId)) {
        socket.emit("matchmakingBlocked", {
          message: "This account is already playing a game in another tab or window.",
        });
        return;
      }

      const alreadyQueued = matchmakingQueue.some(
        (queuedPlayer) => queuedPlayer.socketId === socket.id,
      );

      if (alreadyQueued) {
        socket.emit("waitingForMatch");
        return;
      }

      if (isUserQueued(userId)) {
        socket.emit("matchmakingBlocked", {
          message:
            "This account is already searching for a match in another tab or window.",
        });
        return;
      }

      const player = {
        socketId: socket.id,
        userId,
        username: socket.user.username,
        displayName: socket.user.displayName || socket.user.username,
        rating: socket.user.rating,
        colorPreference: normalizeColorPreference(payload.colorPreference),
        joinedAt: Date.now(),
      };

      const opponent = findMatch(player);

      if (opponent) {
        logger.info(`Match found: ${player.username} vs ${opponent.username}`);
        startGame(io, player, opponent);
      } else {
        matchmakingQueue.push(player);
        socket.emit("waitingForMatch");
        logger.info(
          `${player.username} added to queue. Queue size: ${matchmakingQueue.length}`,
        );
      }
    });

    socket.on("playBot", (payload = {}) => {
      const userId = socket.user._id || socket.user.id;

      if (isUserInActiveGame(userId)) {
        socket.emit("matchmakingBlocked", {
          message: "This account is already playing a game in another tab or window.",
        });
        return;
      }

      if (
        isUserQueued(userId) &&
        !matchmakingQueue.some((player) => player.socketId === socket.id)
      ) {
        socket.emit("matchmakingBlocked", {
          message:
            "This account is already searching for a match in another tab or window.",
        });
        return;
      }

      removePlayerFromQueue(socket.id);

      socket.emit("waitingForBotMatch");

      const player = {
        socketId: socket.id,
        userId,
        username: socket.user.username,
        displayName: socket.user.displayName || socket.user.username,
        rating: socket.user.rating,
      };

      const settings = parseBotSettings(payload);
      settings.colorPreference = normalizeColorPreference(payload.colorPreference);
      startBotGame(io, player, settings);
    });

    socket.on("cancelMatchmaking", () => {
      const removed = removePlayerFromQueue(socket.id);

      socket.emit("matchmakingCancelled", {
        cancelled: removed,
      });

      if (removed) {
        logger.info(
          `${socket.user?.username} cancelled matchmaking. Queue size: ${matchmakingQueue.length}`,
        );
      }
    });

    // Handle player disconnect
    socket.on("disconnect", () => {
      // Remove from matchmaking queue if still waiting
      const removed = removePlayerFromQueue(socket.id);
      if (removed) {
        logger.info(
          `${socket.user?.username} removed from queue. Queue size: ${matchmakingQueue.length}`,
        );
      }
    });
  });
};
