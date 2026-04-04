const gameManager = require("../game/gameManager");
const timerManager = require("../game/timerManager");
const ratingManager = require("../game/ratingManager");
const botManager = require("../game/botManager");
const { stats } = require("../stats/gameStats");
const { pieceValues } = require("../game/constants");

// Helper function to calculate captured pieces value
const calculateScore = (capturedPieces) => {
  return capturedPieces.reduce(
    (sum, piece) => sum + (pieceValues[piece] || 0),
    0,
  );
};

const isSocketPlayer = (playerId) =>
  typeof playerId === "string" && !playerId.startsWith("bot_");

const applyMoveEffects = (game, move, io) => {
  game.moveHistory.push(move);

  if (move.captured) {
    const capturedBy = move.color === "w" ? "white" : "black";
    game.capturedPieces[capturedBy].push(move.captured);

    game.scores.w = calculateScore(game.capturedPieces.white);
    game.scores.b = calculateScore(game.capturedPieces.black);

    io.to(game.id).emit("capturedPiecesUpdate", game.capturedPieces);
    io.to(game.id).emit("scoreUpdate", game.scores);
  }
};

const emitBoardState = (game, io) => {
  io.to(game.id).emit("boardstate", game.chess.fen());
  io.to(game.id).emit("moveHistory", game.moveHistory);
  io.to(game.id).emit("turnChange", game.chess.turn());
};

const resolveGameResult = (game) => {
  if (!game.chess.isGameOver()) {
    return null;
  }

  if (game.chess.isCheckmate()) {
    const result = game.chess.turn() === "w" ? "black" : "white";
    stats.checkmates++;
    return { result, reason: "Checkmate!" };
  }

  if (game.chess.isDraw()) {
    if (game.chess.isStalemate()) {
      return { result: "draw", reason: "Stalemate!" };
    }
    if (game.chess.isThreefoldRepetition()) {
      return { result: "draw", reason: "Draw by threefold repetition" };
    }
    if (game.chess.isInsufficientMaterial()) {
      return { result: "draw", reason: "Draw by insufficient material" };
    }
    return { result: "draw", reason: "Draw by 50-move rule" };
  }

  return { result: "draw", reason: "Game over" };
};

// Helper function to handle game end
const handleGameEnd = async (game, io, result, reason) => {
  // Stop the timer
  timerManager.stopTimer(game);

  if (game.bot?.pendingMoveTimeout) {
    clearTimeout(game.bot.pendingMoveTimeout);
    game.bot.pendingMoveTimeout = null;
  }

  // Update statistics
  stats.completedGames++;
  if (result === "white") {
    stats.whiteWins++;
  } else if (result === "black") {
    stats.blackWins++;
  } else {
    stats.draws++;
  }

  // Update player ratings
  await ratingManager(game, result, io);

  // Notify players about game end
  let message;
  if (result === "draw") {
    message = reason || "It's a draw!";
  } else {
    const winner = result.charAt(0).toUpperCase() + result.slice(1);
    message = reason ? `${reason}. ${winner} wins!` : `${winner} wins!`;
  }
  io.to(game.id).emit("gameOver", { result, message });

  // Clean up the game after a short delay
  setTimeout(() => {
    gameManager.cleanupGame(game.id);
  }, 5000);
};

const processGameOverIfNeeded = async (game, io) => {
  const outcome = resolveGameResult(game);
  if (!outcome) {
    return false;
  }

  await handleGameEnd(game, io, outcome.result, outcome.reason);
  return true;
};

const maybeScheduleBotMove = (game, io) => {
  if (!game?.isBotGame || !game.bot) {
    return;
  }

  const botColorTurn = game.bot.color === "w" ? "w" : "b";
  if (game.chess.turn() !== botColorTurn || game.chess.isGameOver()) {
    return;
  }

  if (game.bot.pendingMoveTimeout) {
    clearTimeout(game.bot.pendingMoveTimeout);
    game.bot.pendingMoveTimeout = null;
  }

  game.bot.pendingMoveTimeout = setTimeout(async () => {
    try {
      const stillActiveGame = gameManager.games.get(game.id);
      if (!stillActiveGame || stillActiveGame.chess.isGameOver()) {
        return;
      }

      const expectedTurn = stillActiveGame.bot?.color || "b";
      if (stillActiveGame.chess.turn() !== expectedTurn) {
        return;
      }

      const botMoveInput = botManager.getBotMove(stillActiveGame.chess, {
        difficulty: stillActiveGame.bot?.difficulty,
        personality: stillActiveGame.bot?.personality,
        botColor: stillActiveGame.bot?.color,
      });
      if (!botMoveInput) {
        await processGameOverIfNeeded(stillActiveGame, io);
        return;
      }

      const botMove = stillActiveGame.chess.move({
        from: botMoveInput.from,
        to: botMoveInput.to,
        promotion: botMoveInput.promotion,
      });

      if (!botMove) {
        return;
      }

      applyMoveEffects(stillActiveGame, botMove, io);
      io.to(stillActiveGame.id).emit("move", botMove);
      emitBoardState(stillActiveGame, io);

      const ended = await processGameOverIfNeeded(stillActiveGame, io);
      if (!ended) {
        maybeScheduleBotMove(stillActiveGame, io);
      }
    } catch (error) {
      console.error("Bot move error:", error);
    } finally {
      if (game.bot) {
        game.bot.pendingMoveTimeout = null;
      }
    }
  }, game.bot.thinkTimeMs || 500);
};

module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log(
      `Game socket connected: ${socket.user?.username} (${socket.id})`,
    );

    // Handle chess moves
    socket.on("move", async (moveData) => {
      try {
        const game = gameManager.getGameBySocket(socket.id);

        if (!game) {
          return socket.emit("error", { message: "Game not found" });
        }

        // Verify it's the player's turn
        const currentTurn = game.chess.turn();
        const isWhitePlayer = game.players.white === socket.id;
        const isBlackPlayer = game.players.black === socket.id;

        if (
          (currentTurn === "w" && !isWhitePlayer) ||
          (currentTurn === "b" && !isBlackPlayer)
        ) {
          return socket.emit("error", { message: "Not your turn" });
        }

        // Attempt the move
        const move = game.chess.move(moveData);

        if (!move) {
          return socket.emit("error", { message: "Invalid move" });
        }

        applyMoveEffects(game, move, io);

        // Broadcast the move to opponent only (not back to sender)
        socket.to(game.id).emit("move", move);

        // But broadcast boardstate and history to all players including sender
        emitBoardState(game, io);

        // Check for game end conditions
        const gameEnded = await processGameOverIfNeeded(game, io);
        if (!gameEnded) {
          maybeScheduleBotMove(game, io);
        }
      } catch (error) {
        console.error("Move error:", error);
        socket.emit("error", { message: "Failed to process move" });
      }
    });

    // Handle resignation
    socket.on("resign", async () => {
      try {
        const game = gameManager.getGameBySocket(socket.id);

        if (!game) return;

        const isWhitePlayer = game.players.white === socket.id;
        const result = isWhitePlayer ? "black" : "white";
        const resigningColor = isWhitePlayer ? "White" : "Black";
        const winnerColor = isWhitePlayer ? "Black" : "White";

        stats.resignations++;

        io.to(game.id).emit("gameResigned", {
          resignedBy: resigningColor,
          resignedColor: isWhitePlayer ? "w" : "b",
          winner: isWhitePlayer ? "b" : "w",
          message: `${resigningColor} resigned`,
        });

        await handleGameEnd(game, io, result, `${resigningColor} resigned`);
      } catch (error) {
        console.error("Resignation error:", error);
      }
    });

    // Handle draw offer
    socket.on("offerDraw", () => {
      const game = gameManager.getGameBySocket(socket.id);

      if (!game) return;

      if (game.isBotGame) {
        setTimeout(() => {
          socket.emit("drawDeclined", {
            color: game.bot?.color || "b",
            message: "Chess Bot declined the draw offer",
          });
        }, 500);
        return;
      }

      const isWhitePlayer = game.players.white === socket.id;
      const opponent = isWhitePlayer ? game.players.black : game.players.white;
      const offeringColor = isWhitePlayer ? "White" : "Black";

      io.to(opponent).emit("drawOffered", {
        by: offeringColor,
        message: `${offeringColor} offers a draw`,
      });
    });

    // Handle draw acceptance
    socket.on("acceptDraw", async () => {
      const game = gameManager.getGameBySocket(socket.id);

      if (!game) return;

      if (game.isBotGame) {
        return;
      }

      const isWhitePlayer = game.players.white === socket.id;
      const acceptingColor = isWhitePlayer ? "w" : "b";

      io.to(game.id).emit("drawAccepted", {
        color: acceptingColor,
        message: "Draw accepted by both players",
      });
      await handleGameEnd(game, io, "draw", "Draw by agreement");
    });

    // Handle draw decline
    socket.on("declineDraw", () => {
      const game = gameManager.getGameBySocket(socket.id);

      if (!game) return;

      if (game.isBotGame) {
        return;
      }

      const isWhitePlayer = game.players.white === socket.id;
      const opponent = isWhitePlayer ? game.players.black : game.players.white;
      const decliningColor = isWhitePlayer ? "w" : "b";

      io.to(opponent).emit("drawDeclined", {
        color: decliningColor,
        message: "Draw offer declined",
      });
    });

    // Handle disconnect during game
    socket.on("disconnect", async () => {
      const game = gameManager.getGameBySocket(socket.id);

      if (game) {
        if (game.isBotGame) {
          timerManager.stopTimer(game);
          gameManager.cleanupGame(game.id);
          return;
        }

        const isWhitePlayer = game.players.white === socket.id;
        const disconnectedColor = isWhitePlayer ? "White" : "Black";
        const opponent = isWhitePlayer
          ? game.players.black
          : game.players.white;

        // Notify opponent
        if (isSocketPlayer(opponent)) {
          io.to(opponent).emit("opponentDisconnected", {
            message: `${disconnectedColor} disconnected`,
          });
        }

        // Give them 30 seconds to reconnect, otherwise forfeit
        setTimeout(async () => {
          const stillExists = gameManager.games.has(game.id);
          if (stillExists) {
            const result = isWhitePlayer ? "black" : "white";
            io.to(game.id).emit(
              "gameMessage",
              `${disconnectedColor} abandoned the game`,
            );
            await handleGameEnd(
              game,
              io,
              result,
              `${disconnectedColor} disconnected`,
            );
          }
        }, 30000);
      }

      console.log(
        `Player disconnected: ${socket.user?.username} (${socket.id})`,
      );
    });
  });
};
