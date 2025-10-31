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
let waitingPlayer = null; // Player waiting for an opponent

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

// Legacy compatibility - for the default game
const chess = new Chess();
let players = {}; // To store player socket IDs
let currentPlayer = "w"; // Current player's turn
let playerScores = { w: 0, b: 0 }; // Store scores for white and black
let playerTimers = { white: 600, black: 600 }; // 10 minutes = 600 seconds for each player
let timerInterval = null; // Interval for countdown
let capturedPieces = { white: [], black: [] }; // Track captured pieces by each player

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
const createNewGame = (gameId) => {
  const game = {
    id: gameId,
    chess: new Chess(),
    players: {},
    timers: { white: 600, black: 600 },
    scores: { w: 0, b: 0 },
    capturedPieces: { white: [], black: [] },
    timerInterval: null,
    moveHistory: [],
    createdAt: Date.now(),
  };
  games.set(gameId, game);
  gameStats.totalGames++;
  return game;
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

// Start the timer countdown (legacy - for backward compatibility)
const startTimer = () => {
  if (timerInterval) {
    clearInterval(timerInterval);
  }

  console.log("Starting timer...");

  timerInterval = setInterval(() => {
    const currentPlayerColor = chess.turn() === "w" ? "white" : "black";

    if (playerTimers[currentPlayerColor] > 0) {
      playerTimers[currentPlayerColor]--;

      // Broadcast timer update to all clients
      io.emit("timerUpdate", playerTimers);

      // Log every 10 seconds
      if (playerTimers[currentPlayerColor] % 10 === 0) {
        console.log(
          `Timer update - White: ${playerTimers.white}s, Black: ${playerTimers.black}s`
        );
      }

      // Check if time has run out
      if (playerTimers[currentPlayerColor] === 0) {
        clearInterval(timerInterval);
        timerInterval = null;

        const loser = currentPlayerColor === "white" ? "White" : "Black";
        const winner = currentPlayerColor === "white" ? "Black" : "White";

        console.log(`${loser} ran out of time! ${winner} wins!`);

        io.emit(
          "gameMessage",
          `Game Over! ${winner} wins by timeout! Game will restart in 5 seconds...`
        );
        io.emit("timeOut", {
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
          // Check if both players are still connected before resetting
          const whitePlayer = players.white;
          const blackPlayer = players.black;

          if (whitePlayer && blackPlayer) {
            console.log("Both players still connected. Resetting game...");
            resetGame();
            io.emit("gameMessage", "New game started! Good luck!");

            console.log("Starting countdown for new game...");
            io.emit("startCountdown");

            let countdown = 3;
            const countdownInterval = setInterval(() => {
              io.emit("countdownTick", countdown);
              countdown--;

              if (countdown < 0) {
                clearInterval(countdownInterval);
                io.emit("gameStart");
                console.log("Starting timer after countdown...");
                startTimer();
              }
            }, 1000);
          }
        }, 5000); // Give 5 seconds to see the result
      }
    }
  }, 1000);
};

// Reset game function (keeps players connected)
const resetGame = () => {
  // Save current players before reset
  const savedPlayers = { ...players };

  chess.reset();
  playerScores = { w: 0, b: 0 };
  playerTimers = { white: 600, black: 600 };
  capturedPieces = { white: [], black: [] };
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  // Restore players
  players = savedPlayers;

  io.emit("boardstate", chess.fen());
  io.emit("scoreUpdate", playerScores);
  io.emit("timerUpdate", playerTimers);
  io.emit("capturedPiecesUpdate", capturedPieces);
  io.emit("moveHistory", chess.history({ verbose: true })); // Reset move history
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

  // Assign roles to the first two players (white/black)
  if (!players.white && !players.black) {
    // First player joins - randomly assign white or black
    const randomColor = Math.random() < 0.5 ? "white" : "black";
    const playerRole = randomColor === "white" ? "w" : "b";

    players[randomColor] = uniqueSocket.id;
    uniqueSocket.emit("playerRole", playerRole);
    uniqueSocket.emit("waitingForOpponent");
    uniqueSocket.emit("boardstate", chess.fen());
    uniqueSocket.emit("scoreUpdate", playerScores);
    uniqueSocket.emit("timerUpdate", playerTimers);
    uniqueSocket.emit("capturedPiecesUpdate", capturedPieces);
    uniqueSocket.emit("moveHistory", chess.history({ verbose: true }));

    console.log(`First player assigned ${randomColor}`);
  } else if (!players.white || !players.black) {
    // Second player joins - assign the remaining color
    const remainingColor = !players.white ? "white" : "black";
    const playerRole = remainingColor === "white" ? "w" : "b";
    const otherColor = remainingColor === "white" ? "black" : "white";

    players[remainingColor] = uniqueSocket.id;
    uniqueSocket.emit("playerRole", playerRole);
    uniqueSocket.emit("boardstate", chess.fen());
    uniqueSocket.emit("scoreUpdate", playerScores);
    uniqueSocket.emit("timerUpdate", playerTimers);
    uniqueSocket.emit("capturedPiecesUpdate", capturedPieces);
    uniqueSocket.emit("moveHistory", chess.history({ verbose: true }));

    console.log(`Second player assigned ${remainingColor}`);

    // Notify the other player that opponent has joined/reconnected
    if (players[otherColor]) {
      io.to(players[otherColor]).emit("opponentReconnected", {
        color: remainingColor.charAt(0).toUpperCase() + remainingColor.slice(1),
        message: `${
          remainingColor.charAt(0).toUpperCase() + remainingColor.slice(1)
        } player has joined!`,
      });
    }

    // Both players are now connected - start countdown
    console.log("Both players connected. Starting countdown...");
    io.emit("startCountdown"); // Tell both players countdown is starting

    // Start 3-second countdown
    let countdown = 3;
    const countdownInterval = setInterval(() => {
      io.emit("countdownTick", countdown);
      countdown--;

      if (countdown < 0) {
        clearInterval(countdownInterval);
        io.emit("gameStart"); // Tell clients game is starting
        startTimer(); // Start the game timer
      }
    }, 1000);
  } else {
    uniqueSocket.emit("spectatorRole"); // Notify spectators
    uniqueSocket.emit("boardstate", chess.fen()); // Send current board state to spectators
    uniqueSocket.emit("timerUpdate", playerTimers); // Send current timers to spectators
    uniqueSocket.emit("capturedPiecesUpdate", capturedPieces); // Send captured pieces
    uniqueSocket.emit("moveHistory", chess.history({ verbose: true })); // Send move history
  }

  uniqueSocket.on("disconnect", () => {
    console.log("User disconnected:", uniqueSocket.id);

    // Remove player from the game if they disconnect
    if (uniqueSocket.id === players.white) {
      // Notify black player that white disconnected
      if (players.black) {
        io.to(players.black).emit("opponentDisconnected", {
          color: "White",
          message:
            "White player disconnected. Waiting for reconnection or new opponent...",
        });
      }
      delete players.white;

      // Stop timer if game was in progress
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
    } else if (uniqueSocket.id === players.black) {
      // Notify white player that black disconnected
      if (players.white) {
        io.to(players.white).emit("opponentDisconnected", {
          color: "Black",
          message:
            "Black player disconnected. Waiting for reconnection or new opponent...",
        });
      }
      delete players.black;

      // Stop timer if game was in progress
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
    }
  });

  // Handle move events
  uniqueSocket.on("move", (move) => {
    try {
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
      if (chess.turn() === "w" && uniqueSocket.id !== players.white) return;
      if (chess.turn() === "b" && uniqueSocket.id !== players.black) return;

      // Attempt the move in Chess.js
      const result = chess.move(move);
      if (result) {
        // Determine the capturing player before turn switch
        const capturingPlayer = chess.turn() === "w" ? "b" : "w"; // Opposite player of current turn

        // Check if a piece was captured
        if (result.captured) {
          const pieceValue = pieceValues[result.captured.toLowerCase()];

          // Update the score for the capturing player
          playerScores[capturingPlayer] += pieceValue;

          // Add captured piece to the capturing player's list
          const capturedPieceType = result.captured.toLowerCase();
          const capturedPieceColor = result.color === "w" ? "b" : "w"; // Opposite color of the moving piece
          const capturingPlayerKey =
            capturingPlayer === "w" ? "white" : "black";

          capturedPieces[capturingPlayerKey].push({
            type: capturedPieceType,
            color: capturedPieceColor,
          });

          // Emit updated scores and captured pieces to all clients
          io.emit("scoreUpdate", playerScores); // Broadcast the updated scores
          io.emit("capturedPiecesUpdate", capturedPieces); // Broadcast captured pieces
        }

        // Switch turn after move
        currentPlayer = chess.turn();

        // Emit the move and the updated board state
        io.emit("move", move); // Broadcast the move to all clients
        io.emit("boardstate", chess.fen()); // Broadcast the updated board state

        // Emit move history to all clients
        const moveHistory = chess.history({ verbose: true });
        io.emit("moveHistory", moveHistory);

        // Log scores for debugging
        console.log("Scores updated:", playerScores); // Log scores for debugging

        // Log special moves
        if (result.flags.includes("p")) {
          console.log(
            `Pawn promotion: ${result.from} to ${result.to}, promoted to ${result.promotion}`
          );
        }
        if (result.flags.includes("k") || result.flags.includes("q")) {
          console.log(
            `Castling: ${result.flags.includes("k") ? "Kingside" : "Queenside"}`
          );
        }
        if (result.flags.includes("e")) {
          console.log(`En passant capture: ${result.from} to ${result.to}`);
        }

        // Check for checkmate (no need to check for check, handled visually on client)
        if (chess.isCheckmate()) {
          const winner = currentPlayer === "w" ? "Black" : "White";
          io.emit(
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
          clearInterval(timerInterval);
          setTimeout(() => {
            // Check if both players are still connected before resetting
            const whitePlayer = players.white;
            const blackPlayer = players.black;

            if (whitePlayer && blackPlayer) {
              console.log("Both players still connected. Resetting game...");
              resetGame();
              io.emit("gameMessage", "New game started! Good luck!");

              console.log("Starting countdown for new game...");
              io.emit("startCountdown");

              let countdown = 3;
              const countdownInterval = setInterval(() => {
                io.emit("countdownTick", countdown);
                countdown--;

                if (countdown < 0) {
                  clearInterval(countdownInterval);
                  io.emit("gameStart");
                  console.log("Starting timer after countdown...");
                  startTimer();
                }
              }, 1000);
            }
          }, 3000);
        } else if (chess.isStalemate()) {
          io.emit(
            "gameMessage",
            "Game Over! Stalemate - It's a draw! Game will restart in 3 seconds..."
          );

          // Update statistics
          gameStats.draws++;
          gameStats.completedGames++;

          clearInterval(timerInterval);
          setTimeout(() => {
            // Check if both players are still connected before resetting
            const whitePlayer = players.white;
            const blackPlayer = players.black;

            if (whitePlayer && blackPlayer) {
              console.log("Both players still connected. Resetting game...");
              resetGame();
              io.emit("gameMessage", "New game started! Good luck!");

              console.log("Starting countdown for new game...");
              io.emit("startCountdown");

              let countdown = 3;
              const countdownInterval = setInterval(() => {
                io.emit("countdownTick", countdown);
                countdown--;

                if (countdown < 0) {
                  clearInterval(countdownInterval);
                  io.emit("gameStart");
                  console.log("Starting timer after countdown...");
                  startTimer();
                }
              }, 1000);
            }
          }, 3000);
        } else if (chess.isDraw()) {
          io.emit(
            "gameMessage",
            "Game Over! Draw by insufficient material or repetition! Game will restart in 3 seconds..."
          );

          // Update statistics
          gameStats.draws++;
          gameStats.completedGames++;

          clearInterval(timerInterval);
          setTimeout(() => {
            // Check if both players are still connected before resetting
            const whitePlayer = players.white;
            const blackPlayer = players.black;

            if (whitePlayer && blackPlayer) {
              console.log("Both players still connected. Resetting game...");
              resetGame();
              io.emit("gameMessage", "New game started! Good luck!");

              console.log("Starting countdown for new game...");
              io.emit("startCountdown");

              let countdown = 3;
              const countdownInterval = setInterval(() => {
                io.emit("countdownTick", countdown);
                countdown--;

                if (countdown < 0) {
                  clearInterval(countdownInterval);
                  io.emit("gameStart");
                  console.log("Starting timer after countdown...");
                  startTimer();
                }
              }, 1000);
            }
          }, 3000);
        } else {
          // Emit the turn change
          io.emit("turnChange", currentPlayer); // Emit the current player's turn
        }
      } else {
        console.log("Invalid move:", move);
        uniqueSocket.emit("invalidMove", move); // Inform the client of an invalid move
      }
    } catch (err) {
      console.log("Error handling move:", err);
      uniqueSocket.emit("invalidMove", move); // Inform the client of an error
    }
  });

  // Handle resign events
  uniqueSocket.on("resign", (data) => {
    console.log("Player resigned:", data);

    // Determine who resigned and who won
    let resignedColor, winner, winnerSocketId;

    if (data.color === "w" && uniqueSocket.id === players.white) {
      resignedColor = "w";
      winner = "b";
      winnerSocketId = players.black;
    } else if (data.color === "b" && uniqueSocket.id === players.black) {
      resignedColor = "b";
      winner = "w";
      winnerSocketId = players.white;
    } else {
      return; // Invalid resign attempt
    }

    const resignedColorName = resignedColor === "w" ? "White" : "Black";
    const winnerColorName = winner === "w" ? "White" : "Black";

    // Stop the timer
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }

    // Update statistics
    gameStats.resignations++;
    gameStats.completedGames++;
    if (winnerColorName === "White") {
      gameStats.whiteWins++;
    } else {
      gameStats.blackWins++;
    }

    // Notify all clients about the resignation
    io.emit("gameResigned", {
      resignedColor: resignedColor,
      winner: winner,
      message: `${resignedColorName} resigned. ${winnerColorName} wins!`,
    });

    io.emit(
      "gameMessage",
      `Game Over! ${resignedColorName} resigned. ${winnerColorName} wins! Game will restart in 5 seconds...`
    );

    console.log(`${resignedColorName} resigned. ${winnerColorName} wins!`);

    // Reset the game after 5 seconds
    setTimeout(() => {
      // Check if both players are still connected before resetting
      const whitePlayer = players.white;
      const blackPlayer = players.black;

      if (whitePlayer && blackPlayer) {
        console.log("Both players still connected. Resetting game...");
        resetGame();
        io.emit("gameMessage", "New game started! Good luck!");

        console.log("Starting countdown for new game...");
        io.emit("startCountdown");

        let countdown = 3;
        const countdownInterval = setInterval(() => {
          io.emit("countdownTick", countdown);
          countdown--;

          if (countdown < 0) {
            clearInterval(countdownInterval);
            io.emit("gameStart");
            console.log("Starting timer after countdown...");
            startTimer();
          }
        }, 1000);
      }
    }, 5000);
  });

  // Handle draw offer events
  uniqueSocket.on("offerDraw", (data) => {
    console.log("Draw offer from:", data.color);

    // Validate that the player is actually in the game
    if (
      (data.color === "w" && uniqueSocket.id !== players.white) ||
      (data.color === "b" && uniqueSocket.id !== players.black)
    ) {
      return; // Invalid draw offer
    }

    // Send draw offer to opponent
    const opponentSocketId = data.color === "w" ? players.black : players.white;

    if (opponentSocketId) {
      io.to(opponentSocketId).emit("drawOffered", {
        color: data.color === "w" ? "White" : "Black",
        message: `${
          data.color === "w" ? "White" : "Black"
        } has offered a draw.`,
      });
      console.log(`Draw offer sent to opponent (${data.color})`);
    }
  });

  // Handle draw acceptance
  uniqueSocket.on("acceptDraw", (data) => {
    console.log("Draw accepted by:", data.color);

    // Validate that the player is actually in the game
    if (
      (data.color === "w" && uniqueSocket.id !== players.white) ||
      (data.color === "b" && uniqueSocket.id !== players.black)
    ) {
      return; // Invalid acceptance
    }

    // Stop the timer
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }

    // Update statistics
    gameStats.draws++;
    gameStats.completedGames++;

    // Notify all clients about the draw
    io.emit("drawAccepted", {
      message: "Game Over! Draw agreed by both players.",
    });

    io.emit(
      "gameMessage",
      "Game Over! Draw agreed by both players. Game will restart in 5 seconds..."
    );

    console.log("Draw accepted. Game ended in a draw.");

    // Reset the game after 5 seconds
    setTimeout(() => {
      // Check if both players are still connected before resetting
      const whitePlayer = players.white;
      const blackPlayer = players.black;

      if (whitePlayer && blackPlayer) {
        console.log("Both players still connected. Resetting game...");
        resetGame();
        io.emit("gameMessage", "New game started! Good luck!");

        console.log("Starting countdown for new game...");
        io.emit("startCountdown");

        let countdown = 3;
        const countdownInterval = setInterval(() => {
          io.emit("countdownTick", countdown);
          countdown--;

          if (countdown < 0) {
            clearInterval(countdownInterval);
            io.emit("gameStart");
            console.log("Starting timer after countdown...");
            startTimer();
          }
        }, 1000);
      }
    }, 5000);
  });

  // Handle draw decline
  uniqueSocket.on("declineDraw", (data) => {
    console.log("Draw declined by:", data.color);

    // Validate that the player is actually in the game
    if (
      (data.color === "w" && uniqueSocket.id !== players.white) ||
      (data.color === "b" && uniqueSocket.id !== players.black)
    ) {
      return; // Invalid decline
    }

    // Notify the player who offered the draw
    const offeringPlayerSocketId =
      data.color === "w" ? players.black : players.white;

    if (offeringPlayerSocketId) {
      io.to(offeringPlayerSocketId).emit("drawDeclined", {
        color: data.color === "w" ? "White" : "Black",
        message: `${
          data.color === "w" ? "White" : "Black"
        } declined the draw offer.`,
      });
      console.log(`Draw offer declined by ${data.color}`);
    }
  });
});

const PORT = process.env.PORT || 3000; // ✅ Render expects process.env.PORT
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
