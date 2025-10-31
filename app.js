const express = require("express");
const app = express();
const { Chess } = require("chess.js");
const path = require("path");
const http = require("http");
const server = http.createServer(app);
const socket = require("socket.io");
const io = socket(server);

// Game state management for multiple concurrent games
const games = new Map();
const socketToGame = new Map(); // Track which game each socket is in
const waitingPlayers = []; // Queue of players waiting for a match

// Game statistics
const gameStats = {
  totalGames: 0,
  completedGames: 0,
  whiteWins: 0,
  blackWins: 0,
  draws: 0,
  resignations: 0,
  timeouts: 0,
  checkmates: 0,
};

// Rate limiting for moves
const moveRateLimits = new Map();

// Piece point values
const pieceValues = {
  p: 1, // Pawn
  n: 3, // Knight
  b: 3, // Bishop
  r: 5, // Rook
  q: 9, // Queen
  k: 0, // King (invaluable, no points)
};

// Helper function to generate unique game ID
const generateGameId = () => {
  return `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Helper function to create a new game
const createNewGame = (gameId, whiteSocketId, blackSocketId) => {
  const game = {
    id: gameId,
    chess: new Chess(),
    players: {
      white: whiteSocketId,
      black: blackSocketId,
    },
    timers: { white: 600, black: 600 },
    scores: { w: 0, b: 0 },
    capturedPieces: { white: [], black: [] },
    timerInterval: null,
    moveHistory: [],
    createdAt: Date.now(),
  };
  games.set(gameId, game);
  gameStats.totalGames++;

  // Map sockets to game
  socketToGame.set(whiteSocketId, gameId);
  socketToGame.set(blackSocketId, gameId);

  return game;
};

// Helper function to start game timer for a specific game
const startGameTimer = (gameId) => {
  const game = games.get(gameId);
  if (!game) return;

  if (game.timerInterval) {
    clearInterval(game.timerInterval);
  }

  console.log(`Starting timer for game ${gameId}...`);

  game.timerInterval = setInterval(() => {
    const currentPlayerColor = game.chess.turn() === "w" ? "white" : "black";

    if (game.timers[currentPlayerColor] > 0) {
      game.timers[currentPlayerColor]--;

      // Broadcast timer update to players in this game
      io.to(game.players.white).emit("timerUpdate", game.timers);
      io.to(game.players.black).emit("timerUpdate", game.timers);

      // Check if time has run out
      if (game.timers[currentPlayerColor] === 0) {
        clearInterval(game.timerInterval);
        game.timerInterval = null;

        const loser = currentPlayerColor === "white" ? "White" : "Black";
        const winner = currentPlayerColor === "white" ? "Black" : "White";

        console.log(
          `${loser} ran out of time in game ${gameId}! ${winner} wins!`
        );

        io.to(game.players.white).emit(
          "gameMessage",
          `Game Over! ${winner} wins by timeout! Game will restart in 5 seconds...`
        );
        io.to(game.players.black).emit(
          "gameMessage",
          `Game Over! ${winner} wins by timeout! Game will restart in 5 seconds...`
        );

        io.to(game.players.white).emit("timeOut", {
          message: `${winner} wins! ${loser} ran out of time!`,
          winner: winner,
          loser: loser,
        });
        io.to(game.players.black).emit("timeOut", {
          message: `${winner} wins! ${loser} ran out of time!`,
          winner: winner,
          loser: loser,
        });

        gameStats.timeouts++;
        gameStats.completedGames++;
        if (winner === "White") {
          gameStats.whiteWins++;
        } else {
          gameStats.blackWins++;
        }

        // Reset game after timeout
        setTimeout(() => {
          resetGame(gameId);
        }, 5000);
      }
    }
  }, 1000);
};

// Reset game function for specific game
const resetGame = (gameId) => {
  const game = games.get(gameId);
  if (!game) return;

  game.chess.reset();
  game.scores = { w: 0, b: 0 };
  game.timers = { white: 600, black: 600 };
  game.capturedPieces = { white: [], black: [] };

  if (game.timerInterval) {
    clearInterval(game.timerInterval);
    game.timerInterval = null;
  }

  // Broadcast reset state to both players
  io.to(game.players.white).emit("boardstate", game.chess.fen());
  io.to(game.players.white).emit("scoreUpdate", game.scores);
  io.to(game.players.white).emit("timerUpdate", game.timers);
  io.to(game.players.white).emit("capturedPiecesUpdate", game.capturedPieces);
  io.to(game.players.white).emit(
    "moveHistory",
    game.chess.history({ verbose: true })
  );

  io.to(game.players.black).emit("boardstate", game.chess.fen());
  io.to(game.players.black).emit("scoreUpdate", game.scores);
  io.to(game.players.black).emit("timerUpdate", game.timers);
  io.to(game.players.black).emit("capturedPiecesUpdate", game.capturedPieces);
  io.to(game.players.black).emit(
    "moveHistory",
    game.chess.history({ verbose: true })
  );

  io.to(game.players.white).emit("gameMessage", "New game started! Good luck!");
  io.to(game.players.black).emit("gameMessage", "New game started! Good luck!");

  // Start countdown
  io.to(game.players.white).emit("startCountdown");
  io.to(game.players.black).emit("startCountdown");

  let countdown = 3;
  const countdownInterval = setInterval(() => {
    io.to(game.players.white).emit("countdownTick", countdown);
    io.to(game.players.black).emit("countdownTick", countdown);
    countdown--;

    if (countdown < 0) {
      clearInterval(countdownInterval);
      io.to(game.players.white).emit("gameStart");
      io.to(game.players.black).emit("gameStart");
      startGameTimer(gameId);
    }
  }, 1000);
};

// Helper function to clean up a game
const cleanupGame = (gameId) => {
  const game = games.get(gameId);
  if (game) {
    if (game.timerInterval) {
      clearInterval(game.timerInterval);
    }
    games.delete(gameId);
    console.log(`Game ${gameId} cleaned up`);
  }
};

// Helper function to get game for a socket
const getGameForSocket = (socketId) => {
  const gameId = socketToGame.get(socketId);
  return gameId ? games.get(gameId) : null;
};

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.render("index");
});

// Stats endpoint
app.get("/stats", (req, res) => {
  res.json({
    ...gameStats,
    activeGames: games.size,
    activePlayers: socketToGame.size,
  });
});

io.on("connection", (uniqueSocket) => {
  console.log("A user connected:", uniqueSocket.id);

  // Check if there's a waiting player
  if (waitingPlayers.length > 0) {
    // Match with waiting player
    const waitingPlayer = waitingPlayers.shift();

    // Randomly assign colors
    const randomColor = Math.random() < 0.5;
    const whitePlayer = randomColor ? waitingPlayer : uniqueSocket.id;
    const blackPlayer = randomColor ? uniqueSocket.id : waitingPlayer;

    // Create new game
    const gameId = generateGameId();
    const game = createNewGame(gameId, whitePlayer, blackPlayer);

    console.log(
      `Match found! Game ${gameId} created: White=${whitePlayer}, Black=${blackPlayer}`
    );

    // Send initial game state to both players
    io.to(whitePlayer).emit("playerRole", "w");
    io.to(blackPlayer).emit("playerRole", "b");

    io.to(whitePlayer).emit("boardstate", game.chess.fen());
    io.to(whitePlayer).emit("scoreUpdate", game.scores);
    io.to(whitePlayer).emit("timerUpdate", game.timers);
    io.to(whitePlayer).emit("capturedPiecesUpdate", game.capturedPieces);
    io.to(whitePlayer).emit(
      "moveHistory",
      game.chess.history({ verbose: true })
    );

    io.to(blackPlayer).emit("boardstate", game.chess.fen());
    io.to(blackPlayer).emit("scoreUpdate", game.scores);
    io.to(blackPlayer).emit("timerUpdate", game.timers);
    io.to(blackPlayer).emit("capturedPiecesUpdate", game.capturedPieces);
    io.to(blackPlayer).emit(
      "moveHistory",
      game.chess.history({ verbose: true })
    );

    // Start countdown
    console.log(`Starting countdown for game ${gameId}...`);
    io.to(whitePlayer).emit("startCountdown");
    io.to(blackPlayer).emit("startCountdown");

    let countdown = 3;
    const countdownInterval = setInterval(() => {
      io.to(whitePlayer).emit("countdownTick", countdown);
      io.to(blackPlayer).emit("countdownTick", countdown);
      countdown--;

      if (countdown < 0) {
        clearInterval(countdownInterval);
        io.to(whitePlayer).emit("gameStart");
        io.to(blackPlayer).emit("gameStart");
        startGameTimer(gameId);
      }
    }, 1000);
  } else {
    // No waiting player, add to queue
    waitingPlayers.push(uniqueSocket.id);
    uniqueSocket.emit("waitingForOpponent");
    console.log(
      `Player ${uniqueSocket.id} added to waiting queue. Queue length: ${waitingPlayers.length}`
    );
  }

  uniqueSocket.on("disconnect", () => {
    console.log("User disconnected:", uniqueSocket.id);

    // Remove from waiting queue if present
    const waitingIndex = waitingPlayers.indexOf(uniqueSocket.id);
    if (waitingIndex !== -1) {
      waitingPlayers.splice(waitingIndex, 1);
      console.log(
        `Player removed from waiting queue. Queue length: ${waitingPlayers.length}`
      );
      return;
    }

    // Check if player was in a game
    const gameId = socketToGame.get(uniqueSocket.id);
    if (gameId) {
      const game = games.get(gameId);
      if (game) {
        // Determine which player disconnected
        const isWhite = game.players.white === uniqueSocket.id;
        const isBlack = game.players.black === uniqueSocket.id;

        if (isWhite || isBlack) {
          const opponentId = isWhite ? game.players.black : game.players.white;
          const disconnectedColor = isWhite ? "White" : "Black";

          // Notify opponent
          io.to(opponentId).emit("opponentDisconnected", {
            color: disconnectedColor,
            message: `${disconnectedColor} player disconnected. Game ended.`,
          });

          // Clean up game
          socketToGame.delete(game.players.white);
          socketToGame.delete(game.players.black);
          cleanupGame(gameId);

          console.log(
            `Game ${gameId} ended due to ${disconnectedColor} player disconnect`
          );
        }
      }
    }
  });

  // Handle move events
  uniqueSocket.on("move", (move) => {
    try {
      // Get player's game
      const gameId = socketToGame.get(uniqueSocket.id);
      if (!gameId) return;

      const game = games.get(gameId);
      if (!game) return;

      // Rate limiting - prevent move spam
      const lastMove = moveRateLimits.get(uniqueSocket.id) || 0;
      const now = Date.now();

      if (now - lastMove < 100) {
        // Min 100ms between moves
        return uniqueSocket.emit("invalidMove", {
          from: move.from,
          to: move.to,
          reason: "Please slow down!",
        });
      }

      moveRateLimits.set(uniqueSocket.id, now);

      // Validate input
      if (!move || typeof move !== "object" || !move.from || !move.to) {
        return uniqueSocket.emit("invalidMove", {
          from: move?.from,
          to: move?.to,
          reason: "Invalid move format",
        });
      }

      // Ensure only the correct player can make a move
      if (game.chess.turn() === "w" && uniqueSocket.id !== game.players.white)
        return;
      if (game.chess.turn() === "b" && uniqueSocket.id !== game.players.black)
        return;

      // Attempt the move in Chess.js
      const result = game.chess.move(move);
      if (result) {
        // Determine the capturing player before turn switch
        const capturingPlayer = game.chess.turn() === "w" ? "b" : "w"; // Opposite player of current turn

        // Check if a piece was captured
        if (result.captured) {
          const pieceValue = pieceValues[result.captured.toLowerCase()];

          // Update the score for the capturing player
          game.scores[capturingPlayer] += pieceValue;

          // Add captured piece to the capturing player's list
          const capturedPieceType = result.captured.toLowerCase();
          const capturedPieceColor = result.color === "w" ? "b" : "w"; // Opposite color of the moving piece
          const capturingPlayerKey =
            capturingPlayer === "w" ? "white" : "black";

          game.capturedPieces[capturingPlayerKey].push({
            type: capturedPieceType,
            color: capturedPieceColor,
          });

          // Emit updated scores and captured pieces to both players
          io.to(game.players.white).emit("scoreUpdate", game.scores);
          io.to(game.players.black).emit("scoreUpdate", game.scores);
          io.to(game.players.white).emit(
            "capturedPiecesUpdate",
            game.capturedPieces
          );
          io.to(game.players.black).emit(
            "capturedPiecesUpdate",
            game.capturedPieces
          );
        }

        // Emit the move and the updated board state
        io.to(game.players.white).emit("move", move);
        io.to(game.players.black).emit("move", move);
        io.to(game.players.white).emit("boardstate", game.chess.fen());
        io.to(game.players.black).emit("boardstate", game.chess.fen());

        // Emit move history to both players
        const moveHistory = game.chess.history({ verbose: true });
        io.to(game.players.white).emit("moveHistory", moveHistory);
        io.to(game.players.black).emit("moveHistory", moveHistory);

        // Log scores for debugging
        console.log(`Game ${gameId} - Scores updated:`, game.scores);

        // Log special moves
        if (result.flags.includes("p")) {
          console.log(
            `Game ${gameId} - Pawn promotion: ${result.from} to ${result.to}, promoted to ${result.promotion}`
          );
        }
        if (result.flags.includes("k") || result.flags.includes("q")) {
          console.log(
            `Game ${gameId} - Castling: ${
              result.flags.includes("k") ? "Kingside" : "Queenside"
            }`
          );
        }
        if (result.flags.includes("e")) {
          console.log(
            `Game ${gameId} - En passant capture: ${result.from} to ${result.to}`
          );
        }

        // Check for checkmate
        if (game.chess.isCheckmate()) {
          const winner = game.chess.turn() === "w" ? "Black" : "White";

          io.to(game.players.white).emit(
            "gameMessage",
            `${winner} wins by checkmate! Game will restart in 3 seconds...`
          );
          io.to(game.players.black).emit(
            "gameMessage",
            `${winner} wins by checkmate! Game will restart in 3 seconds...`
          );

          // Update statistics
          gameStats.checkmates++;
          gameStats.completedGames++;
          if (winner === "White") {
            gameStats.whiteWins++;
          } else {
            gameStats.blackWins++;
          }

          // Stop timer and reset game after checkmate
          if (game.timerInterval) {
            clearInterval(game.timerInterval);
            game.timerInterval = null;
          }

          setTimeout(() => {
            resetGame(gameId);
          }, 3000);
        } else if (game.chess.isStalemate()) {
          io.to(game.players.white).emit(
            "gameMessage",
            "Game Over! Stalemate - It's a draw! Game will restart in 3 seconds..."
          );
          io.to(game.players.black).emit(
            "gameMessage",
            "Game Over! Stalemate - It's a draw! Game will restart in 3 seconds..."
          );

          // Update statistics
          gameStats.draws++;
          gameStats.completedGames++;

          if (game.timerInterval) {
            clearInterval(game.timerInterval);
            game.timerInterval = null;
          }

          setTimeout(() => {
            resetGame(gameId);
          }, 3000);
        } else if (game.chess.isDraw()) {
          io.to(game.players.white).emit(
            "gameMessage",
            "Game Over! Draw by insufficient material or repetition! Game will restart in 3 seconds..."
          );
          io.to(game.players.black).emit(
            "gameMessage",
            "Game Over! Draw by insufficient material or repetition! Game will restart in 3 seconds..."
          );

          // Update statistics
          gameStats.draws++;
          gameStats.completedGames++;

          if (game.timerInterval) {
            clearInterval(game.timerInterval);
            game.timerInterval = null;
          }

          setTimeout(() => {
            resetGame(gameId);
          }, 3000);
        } else {
          // Emit the turn change
          const currentPlayer = game.chess.turn();
          io.to(game.players.white).emit("turnChange", currentPlayer);
          io.to(game.players.black).emit("turnChange", currentPlayer);
        }
      } else {
        console.log("Invalid move:", move);
        uniqueSocket.emit("invalidMove", move);
      }
    } catch (err) {
      console.log("Error handling move:", err);
      uniqueSocket.emit("invalidMove", move);
    }
  });

  // Handle resign events
  uniqueSocket.on("resign", (data) => {
    const gameId = socketToGame.get(uniqueSocket.id);
    if (!gameId) return;

    const game = games.get(gameId);
    if (!game) return;

    console.log(`Game ${gameId} - Player resigned:`, data);

    // Determine who resigned and who won
    let resignedColor, winner, winnerSocketId;

    if (data.color === "w" && uniqueSocket.id === game.players.white) {
      resignedColor = "w";
      winner = "b";
      winnerSocketId = game.players.black;
    } else if (data.color === "b" && uniqueSocket.id === game.players.black) {
      resignedColor = "b";
      winner = "w";
      winnerSocketId = game.players.white;
    } else {
      return; // Invalid resign attempt
    }

    const resignedColorName = resignedColor === "w" ? "White" : "Black";
    const winnerColorName = winner === "w" ? "White" : "Black";

    // Stop the timer
    if (game.timerInterval) {
      clearInterval(game.timerInterval);
      game.timerInterval = null;
    }

    // Update statistics
    gameStats.resignations++;
    gameStats.completedGames++;
    if (winnerColorName === "White") {
      gameStats.whiteWins++;
    } else {
      gameStats.blackWins++;
    }

    // Notify both players about the resignation
    io.to(game.players.white).emit("gameResigned", {
      resignedColor: resignedColor,
      winner: winner,
      message: `${resignedColorName} resigned. ${winnerColorName} wins!`,
    });
    io.to(game.players.black).emit("gameResigned", {
      resignedColor: resignedColor,
      winner: winner,
      message: `${resignedColorName} resigned. ${winnerColorName} wins!`,
    });

    io.to(game.players.white).emit(
      "gameMessage",
      `Game Over! ${resignedColorName} resigned. ${winnerColorName} wins! Game will restart in 5 seconds...`
    );
    io.to(game.players.black).emit(
      "gameMessage",
      `Game Over! ${resignedColorName} resigned. ${winnerColorName} wins! Game will restart in 5 seconds...`
    );

    console.log(
      `Game ${gameId} - ${resignedColorName} resigned. ${winnerColorName} wins!`
    );

    // Reset the game after 5 seconds
    setTimeout(() => {
      resetGame(gameId);
    }, 5000);
  });

  // Handle draw offer events
  uniqueSocket.on("offerDraw", (data) => {
    const gameId = socketToGame.get(uniqueSocket.id);
    if (!gameId) return;

    const game = games.get(gameId);
    if (!game) return;

    console.log(`Game ${gameId} - Draw offer from:`, data.color);

    // Validate that the player is actually in the game
    if (
      (data.color === "w" && uniqueSocket.id !== game.players.white) ||
      (data.color === "b" && uniqueSocket.id !== game.players.black)
    ) {
      return; // Invalid draw offer
    }

    // Send draw offer to opponent
    const opponentSocketId =
      data.color === "w" ? game.players.black : game.players.white;

    if (opponentSocketId) {
      io.to(opponentSocketId).emit("drawOffered", {
        color: data.color === "w" ? "White" : "Black",
        message: `${
          data.color === "w" ? "White" : "Black"
        } has offered a draw.`,
      });
      console.log(
        `Game ${gameId} - Draw offer sent to opponent (${data.color})`
      );
    }
  });

  // Handle draw acceptance
  uniqueSocket.on("acceptDraw", (data) => {
    const gameId = socketToGame.get(uniqueSocket.id);
    if (!gameId) return;

    const game = games.get(gameId);
    if (!game) return;

    console.log(`Game ${gameId} - Draw accepted by:`, data.color);

    // Validate that the player is actually in the game
    if (
      (data.color === "w" && uniqueSocket.id !== game.players.white) ||
      (data.color === "b" && uniqueSocket.id !== game.players.black)
    ) {
      return; // Invalid acceptance
    }

    // Stop the timer
    if (game.timerInterval) {
      clearInterval(game.timerInterval);
      game.timerInterval = null;
    }

    // Update statistics
    gameStats.draws++;
    gameStats.completedGames++;

    // Notify both players about the draw
    io.to(game.players.white).emit("drawAccepted", {
      message: "Game Over! Draw agreed by both players.",
    });
    io.to(game.players.black).emit("drawAccepted", {
      message: "Game Over! Draw agreed by both players.",
    });

    io.to(game.players.white).emit(
      "gameMessage",
      "Game Over! Draw agreed by both players. Game will restart in 5 seconds..."
    );
    io.to(game.players.black).emit(
      "gameMessage",
      "Game Over! Draw agreed by both players. Game will restart in 5 seconds..."
    );

    console.log(`Game ${gameId} - Draw accepted. Game ended in a draw.`);

    // Reset the game after 5 seconds
    setTimeout(() => {
      resetGame(gameId);
    }, 5000);
  });

  // Handle draw decline
  uniqueSocket.on("declineDraw", (data) => {
    const gameId = socketToGame.get(uniqueSocket.id);
    if (!gameId) return;

    const game = games.get(gameId);
    if (!game) return;

    console.log(`Game ${gameId} - Draw declined by:`, data.color);

    // Validate that the player is actually in the game
    if (
      (data.color === "w" && uniqueSocket.id !== game.players.white) ||
      (data.color === "b" && uniqueSocket.id !== game.players.black)
    ) {
      return; // Invalid decline
    }

    // Notify the player who offered the draw
    const offeringPlayerSocketId =
      data.color === "w" ? game.players.black : game.players.white;

    if (offeringPlayerSocketId) {
      io.to(offeringPlayerSocketId).emit("drawDeclined", {
        color: data.color === "w" ? "White" : "Black",
        message: `${
          data.color === "w" ? "White" : "Black"
        } declined the draw offer.`,
      });
      console.log(`Game ${gameId} - Draw offer declined by ${data.color}`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
