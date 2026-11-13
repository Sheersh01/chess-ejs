const gameManager = require("../game/gameManager");
const timerManager = require("../game/timerManager");
const { endGame, capitalize, opposite } = require("../game/gameLifecycle");
const { parseMoveInput, playMove } = require("../game/moveService");
const { stats } = require("../stats/gameStats");
const logger = require("../config/logger");

const DISCONNECT_GRACE_MS = Number(process.env.DISCONNECT_GRACE_MS) || 30000;
const DRAW_OFFER_PLY_GAP = 10; // a player may offer at most once every 10 half-moves

const sanitizeChatMessage = (message) =>
  typeof message === "string" ? message.replace(/\s+/g, " ").trim().slice(0, 300) : "";

const getUserId = (socket) => socket.user?._id || socket.user?.id;

/**
 * The game this socket is playing, with its color, or null if the game is over,
 * still counting down (when `requireActive`), or the socket isn't a participant.
 */
const getPlayerContext = (socket, { requireActive = true } = {}) => {
  const game = gameManager.getGameBySocket(socket.id);
  if (!game || game.isFinished) return null;
  if (requireActive && game.status !== "active") return null;
  const color = gameManager.getColorForSocket(game, socket.id);
  return color ? { game, color } : null;
};

const opponentSocketId = (game, color) => {
  const id = game.players[opposite(color)];
  return gameManager.isSocketPlayer(id) ? id : null;
};

const syncReconnectingPlayer = (socket, game, color, io) => {
  socket.emit("playerRole", color === "white" ? "w" : "b");
  if (game.status === "countdown") {
    socket.emit("startCountdown");
    return;
  }
  socket.emit("gameStart");
  socket.emit("boardstate", game.chess.fen());
  socket.emit("moveHistory", game.moveHistory);
  socket.emit("turnChange", game.chess.turn());
  socket.emit("capturedPiecesUpdate", game.capturedPieces);
  socket.emit("scoreUpdate", game.scores);
  timerManager.emitUpdate(game, io, socket);

  if (game.drawOffer && game.drawOffer.by !== color) {
    socket.emit("drawOffered", {
      by: capitalize(game.drawOffer.by),
      color: game.drawOffer.by === "white" ? "w" : "b",
      message: `${capitalize(game.drawOffer.by)} offers a draw`,
    });
  }

  const opponent = opponentSocketId(game, color);
  if (opponent) {
    io.to(opponent).emit("opponentReconnected", {
      color: capitalize(color),
      message: `${capitalize(color)} reconnected`,
    });
  }
};

/** Only resume a game for this user if *their own* side is marked disconnected. */
const tryReconnect = (socket, io) => {
  const userId = getUserId(socket);
  if (!userId) return;

  const game = gameManager.getGameByUserId(userId);
  if (!game || game.isFinished) return;
  const color = gameManager.getColorForUser(game, userId);
  if (!color || !game.disconnectState[color]) return;

  const result = gameManager.reconnectPlayer(userId, socket.id);
  if (!result) return;

  socket.join(game.id);
  syncReconnectingPlayer(socket, game, result.reconnectedColor, io);
  logger.info(`User ${socket.user?.username} reconnected to game ${game.id}`);
};

module.exports = (io) => {
  io.on("connection", (socket) => {
    tryReconnect(socket, io);

    socket.on("move", async (moveData) => {
      try {
        const ctx = getPlayerContext(socket);
        if (!ctx) return socket.emit("error", { message: "No active game" });
        const { game, color } = ctx;

        if (game.chess.turn() !== color.charAt(0)) {
          return socket.emit("error", { message: "Not your turn" });
        }

        const input = parseMoveInput(moveData);
        if (!input) return socket.emit("error", { message: "Invalid move" });

        const result = await playMove(game, io, input, { excludeSocketId: socket.id });
        if (!result.ok) {
          socket.emit("error", { message: result.error });
          socket.emit("boardstate", game.chess.fen());
        }
      } catch (error) {
        logger.error({ err: error }, "Move handling failed");
        socket.emit("error", { message: "Failed to process move" });
      }
    });

    socket.on("chatMessage", (payload = {}) => {
      const ctx = getPlayerContext(socket, { requireActive: false });
      if (!ctx) return;
      if (ctx.game.isBotGame) {
        socket.emit("chatError", {
          message: "Chat is only available in online matches.",
        });
        return;
      }

      const message = sanitizeChatMessage(payload?.message);
      if (!message) return;

      io.to(ctx.game.id).emit("chatMessage", {
        message,
        sender: {
          id: socket.id,
          name: socket.user?.displayName || socket.user?.username || "Player",
          color: ctx.color.charAt(0),
        },
        sentAt: Date.now(),
      });
    });

    socket.on("resign", async () => {
      try {
        const ctx = getPlayerContext(socket);
        if (!ctx) return;
        const { game, color } = ctx;
        const reason = `${capitalize(color)} resigned`;

        stats.resignations++;
        await endGame(game, io, {
          result: opposite(color),
          reason,
          events: [
            [
              "gameResigned",
              {
                resignedBy: capitalize(color),
                resignedColor: color.charAt(0),
                winner: opposite(color).charAt(0),
                message: reason,
              },
            ],
          ],
        });
      } catch (error) {
        logger.error({ err: error }, "Resignation failed");
      }
    });

    socket.on("offerDraw", () => {
      const ctx = getPlayerContext(socket);
      if (!ctx) return;
      const { game, color } = ctx;

      if (game.isBotGame) {
        setTimeout(() => {
          socket.emit("drawDeclined", {
            color: game.bot?.color || "b",
            message: "Chess Bot declined the draw offer",
          });
        }, 500);
        return;
      }

      if (game.drawOffer) {
        socket.emit("error", { message: "A draw offer is already pending" });
        return;
      }

      const ply = game.moveHistory.length;
      const lastOffer = game.lastDrawOfferPly[color];
      if (lastOffer !== null && ply - lastOffer < DRAW_OFFER_PLY_GAP) {
        socket.emit("error", {
          message: "Please wait a few moves before offering again",
        });
        return;
      }

      game.drawOffer = { by: color };
      game.lastDrawOfferPly[color] = ply;

      const opponent = opponentSocketId(game, color);
      if (opponent) {
        io.to(opponent).emit("drawOffered", {
          by: capitalize(color),
          color: color.charAt(0),
          message: `${capitalize(color)} offers a draw`,
        });
      }
    });

    socket.on("acceptDraw", async () => {
      try {
        const ctx = getPlayerContext(socket);
        if (!ctx) return;
        const { game, color } = ctx;

        // Only the opponent of a pending offer can accept it.
        if (game.isBotGame || !game.drawOffer || game.drawOffer.by === color) return;

        await endGame(game, io, {
          result: "draw",
          reason: "Draw by agreement",
          events: [
            [
              "drawAccepted",
              { color: color.charAt(0), message: "Draw accepted by both players" },
            ],
          ],
        });
      } catch (error) {
        logger.error({ err: error }, "Draw acceptance failed");
      }
    });

    socket.on("declineDraw", () => {
      const ctx = getPlayerContext(socket);
      if (!ctx) return;
      const { game, color } = ctx;
      if (game.isBotGame || !game.drawOffer || game.drawOffer.by === color) return;

      const offeredBy = game.drawOffer.by;
      game.drawOffer = null;
      const offerer = game.players[offeredBy];
      if (gameManager.isSocketPlayer(offerer)) {
        io.to(offerer).emit("drawDeclined", {
          color: color.charAt(0),
          message: "Draw offer declined",
        });
      }
    });

    socket.on("disconnect", () => {
      const game = gameManager.getGameBySocket(socket.id);
      if (!game || game.isFinished) return;
      const color = gameManager.getColorForSocket(game, socket.id);
      if (!color) return;

      gameManager.markPlayerDisconnected(game, color);
      gameManager.socketToGame.delete(socket.id);

      const opponent = opponentSocketId(game, color);
      if (opponent) {
        io.to(opponent).emit("opponentDisconnected", {
          color: capitalize(color),
          message: `${capitalize(color)} disconnected`,
        });
      }

      game.disconnectTimers[color] = setTimeout(() => {
        if (game.isFinished || !game.disconnectState[color]) return;
        io.to(game.id).emit("gameMessage", `${capitalize(color)} abandoned the game`);
        endGame(game, io, {
          result: opposite(color),
          reason: `${capitalize(color)} abandoned the game`,
          status: "abandoned",
        }).catch((err) => logger.error({ err }, "Abandon handling failed"));
      }, DISCONNECT_GRACE_MS);

      logger.info(
        `Player disconnected mid-game: ${socket.user?.username} (${socket.id})`,
      );
    });
  });
};
