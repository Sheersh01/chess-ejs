// Initialize socket connection only when ready
let socket = null;
const chess = new Chess();
const boardElement = document.querySelector(".chessboard");
const messageElement = document.querySelector(".message"); // Message container
const turnDisplayElement = document.querySelector(".turn-display"); // Turn display element
const whiteScoreElement = document.querySelector(".white-score"); // White score display element
const blackScoreElement = document.querySelector(".black-score"); // Black score display element
const whiteTimerElement = document.getElementById("white-timer");
const blackTimerElement = document.getElementById("black-timer");
const whiteCapturedElement = document.getElementById("white-captured");
const blackCapturedElement = document.getElementById("black-captured");
const landingScreen = document.getElementById("landing-screen");
const findingMatchScreen = document.getElementById("finding-match-screen");
const countdownScreen = document.getElementById("countdown-screen");
const gameArea = document.getElementById("game-area");
const playButton = document.getElementById("play-button");
const findingMatchText = document.getElementById("finding-match-text");
const findingMatchSubtext = document.getElementById("finding-match-subtext");
const findingMatchStatus = document.getElementById("finding-match-status");
const countdownNumber = document.getElementById("countdown-number");

let draggedPiece = null;
let sourceSquare = null;
let playerRole = null;
let selectedSquare = null;
let gameStarted = false;

// Handle Play button click
playButton.addEventListener("click", () => {
  // Hide landing screen and show finding match screen
  landingScreen.style.display = "none";
  findingMatchScreen.style.display = "flex";

  // Initialize socket connection
  if (!socket) {
    socket = io();
    initializeSocketListeners();
    gameStarted = true;
  }
});

const renderBoard = () => {
  const board = chess.board();
  boardElement.innerHTML = "";

  // Check if king is in check
  let isCheck = false;
  let kingPosition = null;

  try {
    isCheck = chess.in_check();
    const currentTurn = chess.turn();

    // Find the king's position if in check
    if (isCheck) {
      board.forEach((row, rowindex) => {
        row.forEach((square, colindex) => {
          if (square && square.type === "k" && square.color === currentTurn) {
            kingPosition = { row: rowindex, col: colindex };
          }
        });
      });
    }
  } catch (error) {
    console.error("Error checking for check:", error);
  }

  board.forEach((row, rowindex) => {
    row.forEach((square, colindex) => {
      const squareElement = document.createElement("div");
      squareElement.classList.add(
        "square",
        (rowindex + colindex) % 2 === 0 ? "light" : "dark"
      );
      squareElement.dataset.row = rowindex;
      squareElement.dataset.col = colindex;

      // Highlight king square in red if in check
      if (
        kingPosition &&
        kingPosition.row === rowindex &&
        kingPosition.col === colindex
      ) {
        squareElement.classList.add("check");
      }

      // Highlight selected square
      if (
        selectedSquare &&
        selectedSquare.row === rowindex &&
        selectedSquare.col === colindex
      ) {
        squareElement.classList.add("selected");
      }

      if (square) {
        const pieceElement = document.createElement("div");
        pieceElement.classList.add(
          "piece",
          square.color === "w" ? "white" : "black"
        );
        pieceElement.innerText = getPieceUnicode(square);
        pieceElement.draggable = playerRole === square.color;

        pieceElement.addEventListener("dragstart", (e) => {
          if (pieceElement.draggable) {
            draggedPiece = pieceElement;
            sourceSquare = { row: rowindex, col: colindex };
            selectedSquare = sourceSquare;
            e.dataTransfer.setData("text/plain", "");
            showHints(sourceSquare);
          }
        });

        pieceElement.addEventListener("dragend", () => {
          draggedPiece = null;
          sourceSquare = null;
          selectedSquare = null;
          clearHints();
          renderBoard();
        });

        // Click to select piece
        pieceElement.addEventListener("click", (e) => {
          e.stopPropagation();
          if (pieceElement.draggable) {
            // If there's already a selected square and clicking a different piece
            if (
              selectedSquare &&
              !(
                selectedSquare.row === rowindex &&
                selectedSquare.col === colindex
              )
            ) {
              // Try to capture this piece
              const targetSquare = { row: rowindex, col: colindex };
              handleMove(selectedSquare, targetSquare);
              clearHints();
              selectedSquare = null;
            } else if (
              selectedSquare &&
              selectedSquare.row === rowindex &&
              selectedSquare.col === colindex
            ) {
              // Deselect if clicking the same piece
              selectedSquare = null;
              clearHints();
              renderBoard();
            } else {
              // Select this piece
              selectedSquare = { row: rowindex, col: colindex };
              renderBoard();
              showHints(selectedSquare);
            }
          } else if (selectedSquare) {
            // Clicking on opponent's piece when we have a piece selected (capture attempt)
            const targetSquare = { row: rowindex, col: colindex };
            handleMove(selectedSquare, targetSquare);
            clearHints();
            selectedSquare = null;
          }
        });

        squareElement.appendChild(pieceElement);
      }

      squareElement.addEventListener("dragover", (e) => {
        e.preventDefault();
      });

      squareElement.addEventListener("drop", (e) => {
        e.preventDefault();
        if (draggedPiece) {
          const targetSource = {
            row: parseInt(squareElement.dataset.row),
            col: parseInt(squareElement.dataset.col),
          };
          handleMove(sourceSquare, targetSource);
          clearHints();
          selectedSquare = null;
        }
      });

      // Click on square to move selected piece
      squareElement.addEventListener("click", () => {
        if (
          selectedSquare &&
          !(selectedSquare.row === rowindex && selectedSquare.col === colindex)
        ) {
          const targetSquare = { row: rowindex, col: colindex };
          handleMove(selectedSquare, targetSquare);
          clearHints();
          selectedSquare = null;
        }
      });

      boardElement.appendChild(squareElement);
    });
  });

  // Flip the board if the player is black
  if (playerRole === "b") {
    boardElement.classList.add("flipped");
  } else {
    boardElement.classList.remove("flipped");
  }

  // Update check status badges
  updateCheckStatus();
};

const handleMove = (sourceSquare, targetSquare) => {
  if (!socket || !gameStarted) {
    return;
  }

  const move = {
    from: `${String.fromCharCode(97 + sourceSquare.col)}${
      8 - sourceSquare.row
    }`,
    to: `${String.fromCharCode(97 + targetSquare.col)}${8 - targetSquare.row}`,
    promotion: "q",
  };

  // Validate the move on the client side first
  const result = chess.move(move);

  if (result) {
    socket.emit("move", move);
    renderBoard();
  } else {
    alert("Invalid move");
  }
};

// Show hint dots for possible moves
const showHints = (square) => {
  clearHints();
  const squareNotation = `${String.fromCharCode(97 + square.col)}${
    8 - square.row
  }`;
  const moves = chess.moves({ square: squareNotation, verbose: true });

  moves.forEach((move) => {
    const toCol = move.to.charCodeAt(0) - 97;
    const toRow = 8 - parseInt(move.to[1]);

    const targetSquare = document.querySelector(
      `[data-row="${toRow}"][data-col="${toCol}"]`
    );
    if (targetSquare) {
      const hint = document.createElement("div");
      hint.classList.add("hint");

      // Different style for capture moves
      if (move.captured) {
        hint.classList.add("capture");
      }

      targetSquare.appendChild(hint);
    }
  });
};

// Clear all hint dots
const clearHints = () => {
  const hints = document.querySelectorAll(".hint");
  hints.forEach((hint) => hint.remove());
};

// Update check status badges
const updateCheckStatus = () => {
  const whiteCheckBadge = document.getElementById("white-check-status");
  const blackCheckBadge = document.getElementById("black-check-status");

  if (!whiteCheckBadge || !blackCheckBadge) {
    return;
  }

  try {
    const currentTurn = chess.turn();
    const isInCheck = chess.in_check();

    if (currentTurn === "b" && isInCheck) {
      blackCheckBadge.style.display = "inline-block";
      whiteCheckBadge.style.display = "none";
    } else if (currentTurn === "w" && isInCheck) {
      whiteCheckBadge.style.display = "inline-block";
      blackCheckBadge.style.display = "none";
    } else {
      whiteCheckBadge.style.display = "none";
      blackCheckBadge.style.display = "none";
    }
  } catch (error) {
    console.error("Error updating check status:", error);
    whiteCheckBadge.style.display = "none";
    blackCheckBadge.style.display = "none";
  }
};

// Convert chess piece to unicode symbols
const getPieceUnicode = (piece) => {
  const unicodePieces = {
    p: "♙",
    r: "♜",
    n: "♞",
    b: "♝",
    q: "♛",
    k: "♚",
    P: "♙",
    R: "♖",
    N: "♘",
    B: "♗",
    Q: "♕",
    K: "♔",
  };
  return unicodePieces[piece.type] || "";
};

// Initialize socket event listeners
const initializeSocketListeners = () => {
  socket.on("playerRole", (role) => {
    playerRole = role;
  });

  socket.on("spectatorRole", () => {
    playerRole = null;

    findingMatchScreen.style.display = "none";
    gameArea.style.display = "flex";

    renderBoard();
  });

  socket.on("waitingForOpponent", () => {
    findingMatchText.textContent = "Waiting for opponent...";
    findingMatchSubtext.textContent = "You are White";
    findingMatchStatus.textContent = "Waiting for another player to join";
  });

  socket.on("startCountdown", () => {
    findingMatchScreen.style.display = "none";
    countdownScreen.style.display = "flex";
  });

  socket.on("countdownTick", (count) => {
    countdownNumber.textContent = count;
  });

  socket.on("gameStart", () => {
    countdownScreen.style.display = "none";
    gameArea.style.display = "flex";
    renderBoard();
  });

  socket.on("boardstate", (fen) => {
    chess.load(fen);

    messageElement.innerText = "";
    messageElement.style.display = "none";

    renderBoard();
  });

  socket.on("move", (move) => {
    chess.move(move);
    selectedSquare = null;
    clearHints();
    renderBoard();
  });

  socket.on("gameMessage", (message) => {
    messageElement.innerText = message;
    messageElement.style.display = "block";
  });

  socket.on("turnChange", (turn) => {
    messageElement.innerText = "";
    messageElement.style.display = "none";

    turnDisplayElement.innerText =
      turn === "w" ? "White's turn" : "Black's turn";
  });

  socket.on("scoreUpdate", (scores) => {
    const whiteScoreElement = document.querySelector(".white-score");
    const blackScoreElement = document.querySelector(".black-score");

    whiteScoreElement.textContent = scores.w;
    blackScoreElement.textContent = scores.b;
  });

  socket.on("timerUpdate", (timers) => {
    updateTimerDisplay("white", timers.white);
    updateTimerDisplay("black", timers.black);
  });

  socket.on("timeOut", (data) => {
    messageElement.innerText = data.message;
    messageElement.style.display = "block";

    if (data.loser === "White") {
      whiteTimerElement.textContent = "0:00";
      whiteTimerElement.classList.remove("active");
      whiteTimerElement.classList.add("warning");
    } else {
      blackTimerElement.textContent = "0:00";
      blackTimerElement.classList.remove("active");
      blackTimerElement.classList.add("warning");
    }
  });

  socket.on("capturedPiecesUpdate", (capturedPieces) => {
    updateCapturedPieces(capturedPieces);
  });
};

// Update captured pieces display
const updateCapturedPieces = (capturedPieces) => {
  // Clear existing captured pieces
  whiteCapturedElement.innerHTML = "";
  blackCapturedElement.innerHTML = "";

  // Display pieces captured by white
  capturedPieces.white.forEach((piece) => {
    const pieceElement = document.createElement("span");
    pieceElement.classList.add(
      "captured-piece",
      piece.color === "w" ? "white" : "black"
    );
    pieceElement.textContent = getPieceUnicode({ type: piece.type });
    whiteCapturedElement.appendChild(pieceElement);
  });

  // Display pieces captured by black
  capturedPieces.black.forEach((piece) => {
    const pieceElement = document.createElement("span");
    pieceElement.classList.add(
      "captured-piece",
      piece.color === "w" ? "white" : "black"
    );
    pieceElement.textContent = getPieceUnicode({ type: piece.type });
    blackCapturedElement.appendChild(pieceElement);
  });
};

const updateTimerDisplay = (color, seconds) => {
  const timerElement =
    color === "white" ? whiteTimerElement : blackTimerElement;

  if (!timerElement) {
    return;
  }

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  timerElement.textContent = `${minutes}:${secs.toString().padStart(2, "0")}`;

  timerElement.classList.remove("active", "warning");

  const currentTurn = chess.turn();
  if (
    (color === "white" && currentTurn === "w") ||
    (color === "black" && currentTurn === "b")
  ) {
    timerElement.classList.add("active");
  }

  if (seconds < 60) {
    timerElement.classList.add("warning");
  }
};
