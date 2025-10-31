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
const resignButton = document.getElementById("resign-button");
const drawOfferButton = document.getElementById("draw-offer-button");
const moveHistoryContainer = document.querySelector(".move-history-container");
const moveHistoryElement = document.getElementById("move-history");

let draggedPiece = null;
let sourceSquare = null;
let playerRole = null;
let selectedSquare = null;
let gameStarted = false;
let pendingPromotion = null; // Store pending promotion move

// Notification system
const showNotification = (message, type = "info", duration = 3000) => {
  // Remove any existing notification
  const existingNotification = document.querySelector(".game-notification");
  if (existingNotification) {
    existingNotification.remove();
  }

  // Create notification element
  const notification = document.createElement("div");
  notification.className = `game-notification ${type}`;
  notification.textContent = message;

  // Add to document
  document.body.appendChild(notification);

  // Trigger animation
  setTimeout(() => {
    notification.classList.add("show");
  }, 10);

  // Auto remove after duration (unless it's a persistent type)
  if (type !== "disconnect") {
    setTimeout(() => {
      notification.classList.remove("show");
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, duration);
  }

  return notification;
};

// Sound effects system
const sounds = {
  move: new Audio("/sounds/move.mp3"),
  capture: new Audio("/sounds/capture.mp3"),
  check: new Audio("/sounds/check.mp3"),
  castle: new Audio("/sounds/castle.mp3"),
  gameEnd: new Audio("/sounds/game-end.mp3"),
  notify: new Audio("/sounds/notify.mp3"),
};

// Set volume for all sounds
Object.values(sounds).forEach((sound) => {
  sound.volume = 0.5;
});

const playSound = (type) => {
  try {
    if (sounds[type]) {
      sounds[type].currentTime = 0;
      sounds[type].play().catch((e) => console.log("Sound play failed:", e));
    }
  } catch (error) {
    console.log("Sound error:", error);
  }
};

// Update move history display
const updateMoveHistory = () => {
  try {
    const history = chess.history({ verbose: true });

    if (history.length === 0) {
      moveHistoryElement.innerHTML =
        '<p class="text-zinc-500 text-center">No moves yet</p>';
      return;
    }

    // Map piece types to Unicode symbols
    const pieceSymbols = {
      p: "♟", // Pawn
      n: "♞", // Knight
      b: "♝", // Bishop
      r: "♜", // Rook
      q: "♛", // Queen
      k: "♚", // King
    };

    // Helper function to format move with piece
    const formatMove = (move) => {
      const piece = pieceSymbols[move.piece.toLowerCase()] || "";
      return `${piece} ${move.san}`;
    };

    let html = "";
    for (let i = 0; i < history.length; i += 2) {
      const moveNumber = Math.floor(i / 2) + 1;
      const whiteMove = history[i];
      const blackMove = history[i + 1];

      html += `
        <div class="move-pair flex gap-2 py-1 px-2 hover:bg-zinc-700 rounded">
          <span class="move-number text-zinc-400 w-8">${moveNumber}.</span>
          <span class="white-move text-white w-20">${formatMove(
            whiteMove
          )}</span>
          ${
            blackMove
              ? `<span class="black-move text-zinc-300 w-20">${formatMove(
                  blackMove
                )}</span>`
              : ""
          }
        </div>
      `;
    }

    moveHistoryElement.innerHTML = html;
    // Auto-scroll to bottom
    moveHistoryElement.scrollTop = moveHistoryElement.scrollHeight;
  } catch (error) {
    console.error("Error updating move history:", error);
  }
};

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

// Handle Resign button click
resignButton.addEventListener("click", () => {
  if (!socket || !gameStarted || !playerRole) {
    return;
  }

  // Show confirmation dialog
  const colorName = playerRole === "w" ? "White" : "Black";
  const confirmed = confirm(
    `Are you sure you want to resign as ${colorName}?\n\nThis will end the game and your opponent will win.`
  );

  if (confirmed) {
    // Emit resign event to server
    socket.emit("resign", { color: playerRole });

    // Hide resign button
    resignButton.style.display = "none";

    // Show notification
    showNotification("You have resigned from the game.", "info", 3000);
  }
});

// Handle Draw Offer button click
drawOfferButton.addEventListener("click", () => {
  if (!socket || !gameStarted || !playerRole) {
    return;
  }

  // Show confirmation dialog
  const colorName = playerRole === "w" ? "White" : "Black";
  const confirmed = confirm(
    `Offer a draw to your opponent?\n\nYour opponent will be asked to accept or decline.`
  );

  if (confirmed) {
    // Emit draw offer event to server
    socket.emit("offerDraw", { color: playerRole });

    // Disable draw offer button temporarily
    drawOfferButton.disabled = true;
    drawOfferButton.style.opacity = "0.5";
    drawOfferButton.textContent = "🤝 Draw Offered";

    // Show notification
    showNotification("Draw offer sent to opponent.", "info", 3000);

    // Re-enable after 10 seconds
    setTimeout(() => {
      drawOfferButton.disabled = false;
      drawOfferButton.style.opacity = "1";
      drawOfferButton.textContent = "🤝 Offer Draw";
    }, 10000);
  }
});

// Show draw offer dialog when receiving an offer
const showDrawOfferDialog = (offerColor) => {
  const colorName = offerColor === "w" ? "White" : "Black";

  // Play notification sound
  playSound("notify");

  // Create modal overlay
  const overlay = document.createElement("div");
  overlay.id = "draw-offer-overlay";
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    animation: fadeIn 0.3s ease;
  `;

  // Create dialog
  const dialog = document.createElement("div");
  dialog.style.cssText = `
    background: #1f2937;
    padding: 30px;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    max-width: 400px;
    text-align: center;
    animation: scaleIn 0.3s ease;
  `;

  const title = document.createElement("h3");
  title.textContent = "🤝 Draw Offer";
  title.style.cssText = `
    margin: 0 0 15px 0;
    color: #3b82f6;
    font-size: 24px;
    font-weight: bold;
  `;

  const message = document.createElement("p");
  message.textContent = `${colorName} has offered a draw. Do you accept?`;
  message.style.cssText = `
    color: #d1d5db;
    margin: 0 0 25px 0;
    font-size: 16px;
    line-height: 1.5;
  `;

  const buttonsContainer = document.createElement("div");
  buttonsContainer.style.cssText = `
    display: flex;
    gap: 15px;
    justify-content: center;
  `;

  const acceptButton = document.createElement("button");
  acceptButton.textContent = "✓ Accept";
  acceptButton.style.cssText = `
    background: #10b981;
    color: white;
    padding: 12px 24px;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s;
    flex: 1;
  `;
  acceptButton.onmouseover = () => {
    acceptButton.style.background = "#059669";
    acceptButton.style.transform = "scale(1.05)";
  };
  acceptButton.onmouseout = () => {
    acceptButton.style.background = "#10b981";
    acceptButton.style.transform = "scale(1)";
  };
  acceptButton.onclick = () => {
    socket.emit("acceptDraw", { color: playerRole });
    overlay.remove();
  };

  const declineButton = document.createElement("button");
  declineButton.textContent = "✗ Decline";
  declineButton.style.cssText = `
    background: #ef4444;
    color: white;
    padding: 12px 24px;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s;
    flex: 1;
  `;
  declineButton.onmouseover = () => {
    declineButton.style.background = "#dc2626";
    declineButton.style.transform = "scale(1.05)";
  };
  declineButton.onmouseout = () => {
    declineButton.style.background = "#ef4444";
    declineButton.style.transform = "scale(1)";
  };
  declineButton.onclick = () => {
    socket.emit("declineDraw", { color: playerRole });
    overlay.remove();
    showNotification("Draw offer declined.", "info", 2500);
  };

  buttonsContainer.appendChild(acceptButton);
  buttonsContainer.appendChild(declineButton);

  dialog.appendChild(title);
  dialog.appendChild(message);
  dialog.appendChild(buttonsContainer);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
};

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

  const from = `${String.fromCharCode(97 + sourceSquare.col)}${
    8 - sourceSquare.row
  }`;
  const to = `${String.fromCharCode(97 + targetSquare.col)}${
    8 - targetSquare.row
  }`;

  // Check if this is a pawn promotion move
  const piece = chess.get(from);
  const isPromotion =
    piece &&
    piece.type === "p" &&
    ((piece.color === "w" && targetSquare.row === 0) ||
      (piece.color === "b" && targetSquare.row === 7));

  if (isPromotion) {
    // Store the move and show promotion dialog
    pendingPromotion = { from, to, sourceSquare, targetSquare };
    showPromotionDialog(piece.color);
    return;
  }

  // Regular move (includes castling and en passant - handled automatically by chess.js)
  const move = { from, to };

  // Validate the move on the client side first
  const result = chess.move(move);

  if (result) {
    // Play appropriate sound
    if (result.flags.includes("k") || result.flags.includes("q")) {
      playSound("castle");
    } else if (result.captured) {
      playSound("capture");
    } else {
      playSound("move");
    }

    socket.emit("move", move);
    renderBoard();
  } else {
    console.log("Invalid move attempted");
    showNotification("Invalid move! Please try a legal move.", "error", 2500);
  }
};

// Mobile touch support
let touchStartSquare = null;
let touchStartPiece = null;

const handleTouchStart = (e) => {
  if (!playerRole || !gameStarted) return;

  const touch = e.touches[0];
  const element = document.elementFromPoint(touch.clientX, touch.clientY);
  const square = element?.closest(".square");

  if (square) {
    const piece = square.querySelector(".piece");
    if (piece && piece.draggable) {
      e.preventDefault();
      const row = parseInt(square.dataset.row);
      const col = parseInt(square.dataset.col);
      touchStartSquare = { row, col };
      touchStartPiece = piece;

      // Highlight selected square
      selectedSquare = touchStartSquare;
      showHints(touchStartSquare);
      renderBoard();
    }
  }
};

const handleTouchMove = (e) => {
  if (touchStartSquare) {
    e.preventDefault();
  }
};

const handleTouchEnd = (e) => {
  if (!touchStartSquare) return;

  e.preventDefault();
  const touch = e.changedTouches[0];
  const element = document.elementFromPoint(touch.clientX, touch.clientY);
  const square = element?.closest(".square");

  if (square) {
    const row = parseInt(square.dataset.row);
    const col = parseInt(square.dataset.col);
    const targetSquare = { row, col };

    if (row !== touchStartSquare.row || col !== touchStartSquare.col) {
      handleMove(touchStartSquare, targetSquare);
    }
  }

  touchStartSquare = null;
  touchStartPiece = null;
  selectedSquare = null;
  clearHints();
  renderBoard();
};

// Add touch listeners to board
if (boardElement) {
  boardElement.addEventListener("touchstart", handleTouchStart, {
    passive: false,
  });
  boardElement.addEventListener("touchmove", handleTouchMove, {
    passive: false,
  });
  boardElement.addEventListener("touchend", handleTouchEnd, { passive: false });
}

// Show promotion dialog for pawn promotion
const showPromotionDialog = (color) => {
  // Create modal overlay
  const overlay = document.createElement("div");
  overlay.id = "promotion-overlay";
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  `;

  // Create promotion dialog
  const dialog = document.createElement("div");
  dialog.style.cssText = `
    background: white;
    padding: 20px;
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  `;

  const title = document.createElement("h3");
  title.textContent = "Choose Promotion Piece";
  title.style.cssText = `
    margin: 0 0 15px 0;
    text-align: center;
    color: #333;
  `;

  const piecesContainer = document.createElement("div");
  piecesContainer.style.cssText = `
    display: flex;
    gap: 15px;
    justify-content: center;
  `;

  const pieces = [
    { type: "q", symbol: color === "w" ? "♕" : "♛", name: "Queen" },
    { type: "r", symbol: color === "w" ? "♖" : "♜", name: "Rook" },
    { type: "b", symbol: color === "w" ? "♗" : "♝", name: "Bishop" },
    { type: "n", symbol: color === "w" ? "♘" : "♞", name: "Knight" },
  ];

  pieces.forEach((piece) => {
    const button = document.createElement("button");
    button.innerHTML = piece.symbol;
    button.title = piece.name;
    button.style.cssText = `
      font-size: 48px;
      width: 80px;
      height: 80px;
      border: 2px solid #ddd;
      border-radius: 8px;
      background: white;
      cursor: pointer;
      transition: all 0.2s;
    `;
    button.onmouseover = () => {
      button.style.background = "#f0f0f0";
      button.style.borderColor = "#999";
      button.style.transform = "scale(1.1)";
    };
    button.onmouseout = () => {
      button.style.background = "white";
      button.style.borderColor = "#ddd";
      button.style.transform = "scale(1)";
    };
    button.onclick = () => handlePromotion(piece.type);
    piecesContainer.appendChild(button);
  });

  dialog.appendChild(title);
  dialog.appendChild(piecesContainer);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
};

// Handle the promotion choice
const handlePromotion = (pieceType) => {
  // Remove promotion dialog
  const overlay = document.getElementById("promotion-overlay");
  if (overlay) {
    overlay.remove();
  }

  if (!pendingPromotion) return;

  const move = {
    from: pendingPromotion.from,
    to: pendingPromotion.to,
    promotion: pieceType,
  };

  // Validate the move on the client side first
  const result = chess.move(move);

  if (result) {
    socket.emit("move", move);
    renderBoard();
  } else {
    console.log("Invalid promotion move");
    showNotification("Invalid promotion move!", "error", 2500);
  }

  pendingPromotion = null;
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

  socket.on("waitingForMatch", () => {
    findingMatchScreen.style.display = "flex";
    gameArea.style.display = "none";
    findingMatchText.textContent = "Waiting for opponent...";
    findingMatchSubtext.textContent = "Looking for an available player";
    findingMatchStatus.textContent =
      "You will be matched with the next available player";
  });

  socket.on("waitingForOpponent", () => {
    findingMatchText.textContent = "Waiting for opponent...";
    // Display the correct color based on player's role
    const colorName = playerRole === "w" ? "White" : "Black";
    findingMatchSubtext.textContent = `You are ${colorName}`;
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

    // Show resign button, draw offer button and move history for players (not spectators)
    if (playerRole) {
      resignButton.style.display = "block";
      drawOfferButton.style.display = "block";
    }
    moveHistoryContainer.style.display = "block";

    renderBoard();
    updateMoveHistory();
  });

  socket.on("boardstate", (fen) => {
    chess.load(fen);

    messageElement.innerText = "";
    messageElement.style.display = "none";

    renderBoard();
    updateMoveHistory();
  });

  socket.on("move", (move) => {
    const result = chess.move(move);
    selectedSquare = null;
    clearHints();
    renderBoard();
    updateMoveHistory();

    // Play sound for opponent's move
    if (result) {
      if (result.flags.includes("k") || result.flags.includes("q")) {
        playSound("castle");
      } else if (result.captured) {
        playSound("capture");
      } else {
        playSound("move");
      }

      // Check if opponent is in check after this move
      if (chess.in_check()) {
        playSound("check");
      }
    }

    // Highlight special moves
    if (result) {
      if (result.flags.includes("p")) {
        console.log("Pawn promoted to:", result.promotion);
        highlightSpecialMove(result.to, "promotion");
      }
      if (result.flags.includes("k") || result.flags.includes("q")) {
        console.log("Castling move");
        highlightSpecialMove(result.to, "castling");
      }
      if (result.flags.includes("e")) {
        console.log("En passant capture");
        highlightSpecialMove(result.to, "en-passant");
      }
    }
  });

  socket.on("gameMessage", (message) => {
    messageElement.innerText = message;
    messageElement.style.display = "block";
  });

  socket.on("gameResigned", (data) => {
    // Show game over message
    messageElement.innerText = data.message;
    messageElement.style.display = "block";

    // Show popup alert
    const winnerColor = data.winner === "w" ? "White" : "Black";
    const resignedColor = data.resignedColor === "w" ? "White" : "Black";

    setTimeout(() => {
      alert(
        `🏳️ Game Over!\n\n${resignedColor} resigned.\n${winnerColor} wins!\n\nGame will restart shortly...`
      );
    }, 100);
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
    // Hide resign button when game ends
    resignButton.style.display = "none";

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

  socket.on("opponentDisconnected", (data) => {
    console.log("Opponent disconnected:", data);

    // Show persistent notification about disconnection
    const notification = showNotification(
      `${data.color} player disconnected. You can wait for them to reconnect or refresh to find a new opponent.`,
      "disconnect"
    );

    // Also show in the message area
    messageElement.innerText = data.message;
    messageElement.style.display = "block";
    messageElement.style.backgroundColor = "#f59e0b";
    messageElement.style.color = "white";

    // Add a close button to the notification
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.className = "notification-close";
    closeBtn.onclick = () => {
      notification.classList.remove("show");
      setTimeout(() => notification.remove(), 300);
    };
    notification.appendChild(closeBtn);
  });

  socket.on("opponentReconnected", (data) => {
    console.log("Opponent reconnected:", data);

    // Clear any disconnect messages
    const disconnectNotification = document.querySelector(
      ".game-notification.disconnect"
    );
    if (disconnectNotification) {
      disconnectNotification.classList.remove("show");
      setTimeout(() => disconnectNotification.remove(), 300);
    }

    // Clear message area if it has disconnect info
    if (messageElement.innerText.includes("disconnected")) {
      messageElement.innerText = "";
      messageElement.style.display = "none";
      messageElement.style.backgroundColor = "";
    }

    // Show success notification
    showNotification(
      `${data.color} player has joined the game!`,
      "success",
      3000
    );
  });

  // Draw offer events
  socket.on("drawOffered", (data) => {
    console.log("Draw offer received from:", data.color);
    showDrawOfferDialog(data.color);
  });

  socket.on("drawAccepted", (data) => {
    // Show game over message
    messageElement.innerText = data.message;
    messageElement.style.display = "block";
    messageElement.style.backgroundColor = "#3b82f6";
    messageElement.style.color = "white";

    // Show popup alert
    setTimeout(() => {
      alert(
        `🤝 Game Over!\n\nDraw accepted by both players.\n\nGame will restart shortly...`
      );
    }, 100);

    playSound("gameEnd");
  });

  socket.on("drawDeclined", (data) => {
    console.log("Draw offer declined by:", data.color);
    const colorName = data.color === "w" ? "White" : "Black";
    showNotification(`${colorName} declined the draw offer.`, "warning", 3000);
  });

  // Move history update
  socket.on("moveHistory", (history) => {
    try {
      if (history.length === 0) {
        moveHistoryElement.innerHTML =
          '<p class="text-zinc-500 text-center">No moves yet</p>';
        return;
      }

      // Map piece types to Unicode symbols
      const pieceSymbols = {
        p: "♟", // Pawn
        n: "♞", // Knight
        b: "♝", // Bishop
        r: "♜", // Rook
        q: "♛", // Queen
        k: "♚", // King
      };

      // Helper function to format move with piece
      const formatMove = (move) => {
        const piece = pieceSymbols[move.piece.toLowerCase()] || "";
        return `${piece} ${move.san}`;
      };

      let html = "";
      for (let i = 0; i < history.length; i += 2) {
        const moveNumber = Math.floor(i / 2) + 1;
        const whiteMove = history[i];
        const blackMove = history[i + 1];

        html += `
          <div class="move-pair flex gap-2 py-1 px-2 hover:bg-zinc-700 rounded">
            <span class="move-number text-zinc-400 w-8">${moveNumber}.</span>
            <span class="white-move text-white w-20">${formatMove(
              whiteMove
            )}</span>
            ${
              blackMove
                ? `<span class="black-move text-zinc-300 w-20">${formatMove(
                    blackMove
                  )}</span>`
                : ""
            }
          </div>
        `;
      }

      moveHistoryElement.innerHTML = html;
      // Auto-scroll to bottom
      moveHistoryElement.scrollTop = moveHistoryElement.scrollHeight;
    } catch (error) {
      console.error("Error updating move history:", error);
    }
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

// Highlight special moves (castling, en passant, promotion)
const highlightSpecialMove = (square, type) => {
  const col = square.charCodeAt(0) - 97;
  const row = 8 - parseInt(square[1]);

  const squareElement = document.querySelector(
    `[data-row="${row}"][data-col="${col}"]`
  );

  if (squareElement) {
    squareElement.classList.add(type);
    setTimeout(() => {
      squareElement.classList.remove(type);
    }, 1000);
  }
};
