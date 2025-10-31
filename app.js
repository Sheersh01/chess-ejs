const express = require("express");
const app = express();
const { Chess } = require("chess.js");
const path = require("path");
const http = require("http");
const server = http.createServer(app);
const socket = require("socket.io");
const io = socket(server);
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

// Start the timer countdown
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

        io.emit("gameMessage", `Game Over! ${winner} wins by timeout!`);
        io.emit("timeOut", {
          message: `${winner} wins! ${loser} ran out of time!`,
          winner: winner,
          loser: loser,
        });

        // Reset game after timeout
        setTimeout(() => {
          resetGame();
        }, 5000); // Give 5 seconds to see the result
      }
    }
  }, 1000);
};

// Reset game function
const resetGame = () => {
  chess.reset();
  playerScores = { w: 0, b: 0 };
  playerTimers = { white: 600, black: 600 };
  capturedPieces = { white: [], black: [] };
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  io.emit("boardstate", chess.fen());
  io.emit("scoreUpdate", playerScores);
  io.emit("timerUpdate", playerTimers);
  io.emit("capturedPiecesUpdate", capturedPieces);
};

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.render("index");
});

io.on("connection", (uniqueSocket) => {
  console.log("A user connected:", uniqueSocket.id);

  // Assign roles to the first two players (white/black)
  if (!players.white) {
    players.white = uniqueSocket.id;
    uniqueSocket.emit("playerRole", "w"); // Emit the player's role as white
    uniqueSocket.emit("waitingForOpponent"); // Tell them to wait for opponent
    uniqueSocket.emit("boardstate", chess.fen()); // Send current board state to the new player
    uniqueSocket.emit("scoreUpdate", playerScores); // Send initial scores
    uniqueSocket.emit("timerUpdate", playerTimers); // Send initial timers
    uniqueSocket.emit("capturedPiecesUpdate", capturedPieces); // Send captured pieces
  } else if (!players.black) {
    players.black = uniqueSocket.id;
    uniqueSocket.emit("playerRole", "b"); // Emit the player's role as black
    uniqueSocket.emit("boardstate", chess.fen()); // Send current board state to the new player
    uniqueSocket.emit("scoreUpdate", playerScores); // Send initial scores
    uniqueSocket.emit("timerUpdate", playerTimers); // Send initial timers
    uniqueSocket.emit("capturedPiecesUpdate", capturedPieces); // Send captured pieces

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
  }

  uniqueSocket.on("disconnect", () => {
    console.log("User disconnected:", uniqueSocket.id);

    // Remove player from the game if they disconnect
    if (uniqueSocket.id === players.white) {
      delete players.white;
      resetGame();
    } else if (uniqueSocket.id === players.black) {
      delete players.black;
      resetGame();
    }
  });

  // Handle move events
  uniqueSocket.on("move", (move) => {
    try {
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

        // Log scores for debugging
        console.log("Scores updated:", playerScores); // Log scores for debugging

        // Check for checkmate (no need to check for check, handled visually on client)
        if (chess.isCheckmate()) {
          io.emit(
            "gameMessage",
            `${currentPlayer === "w" ? "Black" : "White"} wins by checkmate!`
          );

          // Stop timer and reset game after checkmate
          clearInterval(timerInterval);
          setTimeout(() => {
            resetGame();
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
});

const PORT = process.env.PORT || 3000; // ✅ Render expects process.env.PORT
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
