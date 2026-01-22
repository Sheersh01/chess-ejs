const gameManager = require("../game/gameManager");
const timerManager = require("../game/timerManager");

// Matchmaking queue - stores waiting players
const matchmakingQueue = [];

// Helper function to find match with rating-based matchmaking
const findMatch = (newPlayer) => {
  const RATING_RANGE = 200; // Players within 200 rating points can be matched

  for (let i = 0; i < matchmakingQueue.length; i++) {
    const waitingPlayer = matchmakingQueue[i];

    // Don't match with yourself
    if (waitingPlayer.socketId === newPlayer.socketId) continue;

    // Check if ratings are within acceptable range
    const ratingDiff = Math.abs(waitingPlayer.rating - newPlayer.rating);
    if (ratingDiff <= RATING_RANGE) {
      // Remove matched player from queue
      matchmakingQueue.splice(i, 1);
      return waitingPlayer;
    }
  }

  return null;
};

// Helper function to start game between two players
const startGame = (io, player1, player2) => {
  // Randomly assign colors
  const isPlayer1White = Math.random() < 0.5;
  const whitePlayer = isPlayer1White ? player1 : player2;
  const blackPlayer = isPlayer1White ? player2 : player1;

  // Create the game
  const game = gameManager.createGame(
    whitePlayer.socketId,
    blackPlayer.socketId,
    whitePlayer.userId,
    blackPlayer.userId,
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

      console.log(
        `Game ${game.id} started between ${whitePlayer.username} (white) and ${blackPlayer.username} (black)`,
      );
    }
  }, 1000);
};

module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log(`Player connected: ${socket.user?.username} (${socket.id})`);

    // Automatically add player to matchmaking queue on connection
    const player = {
      socketId: socket.id,
      userId: socket.user._id || socket.user.id,
      username: socket.user.username,
      rating: socket.user.rating,
      joinedAt: Date.now(),
    };

    // Try to find a match
    const opponent = findMatch(player);

    if (opponent) {
      // Match found! Start game immediately
      console.log(`Match found: ${player.username} vs ${opponent.username}`);
      startGame(io, player, opponent);
    } else {
      // No match found, add to queue and wait
      matchmakingQueue.push(player);
      socket.emit("waitingForMatch");
      console.log(
        `${player.username} added to queue. Queue size: ${matchmakingQueue.length}`,
      );
    }

    // Handle player disconnect
    socket.on("disconnect", () => {
      // Remove from matchmaking queue if still waiting
      const index = matchmakingQueue.findIndex((p) => p.socketId === socket.id);
      if (index !== -1) {
        matchmakingQueue.splice(index, 1);
        console.log(
          `${socket.user?.username} removed from queue. Queue size: ${matchmakingQueue.length}`,
        );
      }
    });
  });
};
