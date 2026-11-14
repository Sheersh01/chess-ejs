import { Chess } from "/vendor/chess.js/chess.js";
import { $, el, show } from "../../core/dom.js";
import { Board } from "../../chess/board.js";
import { Clock } from "../../chess/clock.js";
import { renderMoveList } from "../../chess/moveList.js";
import { pieceSrc, PIECE_NAMES } from "../../chess/pieces.js";
import { toast, dismissToast } from "../../ui/toast.js";
import { confirmDialog, openModal } from "../../ui/modal.js";
import { choosePromotion } from "../../ui/promotion.js";
import { playSound, soundForMove } from "../../ui/sounds.js";
import { setMatchLock } from "./matchLock.js";
import { showScreen, stopSearchTimer } from "./lobby.js";

const COLOR_NAME = { w: "white", b: "black" };
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

const announce = (text) => {
  const node = $("#sr-announcer");
  if (!node) return;
  node.textContent = "";
  // Re-set on the next frame so screen readers announce repeated text too.
  requestAnimationFrame(() => {
    node.textContent = text;
  });
};

/** Owns everything on screen while a game is shown, driven by socket events. */
export class GameController {
  constructor({ getSocket, onPlayAgain }) {
    this.getSocket = getSocket;
    this.onPlayAgain = onPlayAgain;
    this.reset();

    this.board = new Board($("#board"), {
      onMove: (move) => this.sendMove(move),
      onPremove: (premove) => {
        if (premove) announce(`Premove set: ${premove.from} to ${premove.to}`);
      },
      requestPromotion: (color) => choosePromotion(color),
      onIllegal: () => playSound("illegal"),
    });

    this.cards = {
      top: $("#player-top"),
      bottom: $("#player-bottom"),
    };
    this.clock = new Clock({ white: null, black: null });

    $("#resign-button")?.addEventListener("click", () => this.confirmResign());
    $("#draw-offer-button")?.addEventListener("click", () => this.offerDraw());
    $("#draw-withdraw-button")?.addEventListener("click", () =>
      this.emit("withdrawDraw"),
    );
    $("#draw-accept-button")?.addEventListener("click", () => this.emit("acceptDraw"));
    $("#draw-decline-button")?.addEventListener("click", () =>
      this.emit("declineDraw"),
    );
    $("#flip-button")?.addEventListener("click", () => this.flip());
    $("#chat-form")?.addEventListener("submit", (event) => this.sendChat(event));
  }

  reset() {
    this.myColor = null;
    this.info = null;
    this.moves = [];
    this.fen = new Chess().fen();
    this.live = false;
    this.finished = false;
    this.orientation = "white";
    this.ratingUpdate = null;
    this.endModal = null;
  }

  emit(event, payload) {
    this.getSocket()?.emit(event, payload);
  }

  get opponentColor() {
    return this.myColor === "w" ? "b" : "w";
  }

  // ---- socket wiring -------------------------------------------------------

  bind(socket) {
    socket.on("playerRole", (role) => this.onRole(role));
    socket.on("gameInfo", (info) => this.onInfo(info));
    socket.on("startCountdown", () => {
      stopSearchTimer();
      showScreen("countdown-screen");
    });
    socket.on("countdownTick", (count) => {
      $("#countdown-number").textContent = count;
    });
    socket.on("gameStart", () => this.onStart());
    socket.on("boardstate", (fen) => this.onBoard(fen));
    socket.on("moveHistory", (moves) => this.onHistory(moves));
    socket.on("turnChange", () => this.renderTurn());
    socket.on("timerUpdate", (payload) => this.clock.update(payload));
    socket.on("capturedPiecesUpdate", (captured) => this.renderCaptured(captured));
    socket.on("scoreUpdate", (scores) => this.renderMaterial(scores));
    socket.on("lowTime", ({ color }) => {
      if (color === COLOR_NAME[this.myColor]) {
        playSound("tenseconds");
        toast("Ten seconds left!", { type: "warning" });
      }
    });
    socket.on("drawOfferState", ({ by }) => this.renderDrawOffer(by));
    socket.on("drawOffered", () => playSound("notify"));
    socket.on("drawDeclined", ({ message }) =>
      toast(message || "Draw declined", { type: "info" }),
    );
    socket.on("drawOfferWithdrawn", ({ message }) => toast(message, { type: "info" }));
    socket.on("gameOver", (payload) => this.onGameOver(payload));
    socket.on("ratingUpdate", (payload) => this.onRatingUpdate(payload));
    socket.on("gameMessage", (message) => this.showMessage(message));
    socket.on("opponentDisconnected", () => {
      toast("Your opponent disconnected. They have 30 seconds to return.", {
        type: "warning",
        persistent: true,
        id: "opponent-connection",
      });
    });
    socket.on("opponentReconnected", () => {
      dismissToast("opponent-connection");
      toast("Your opponent is back.", { type: "success" });
    });
    socket.on("chatMessage", (payload) => this.appendChat(payload));
    socket.on("chatError", ({ message }) => toast(message, { type: "warning" }));
  }

  // ---- lifecycle -----------------------------------------------------------

  onRole(role) {
    this.reset();
    this.myColor = role;
    this.orientation = COLOR_NAME[role];
    this.board.setPlayerColor(role);
    this.board.setOrientation(this.orientation);
    this.board.setLastMove(null);
    this.board.setPremove(null);
    this.board.setPosition(this.fen);
    this.assignCards();
    renderMoveList($("#move-history"), []);
    this.renderCaptured({ white: [], black: [] });
    this.renderMaterial({ w: 0, b: 0 });
    this.renderDrawOffer(null);
    this.showMessage(null);
    this.endModal?.close();
  }

  onInfo(info) {
    this.info = info;
    for (const color of ["white", "black"]) {
      const card = this.cardFor(color);
      if (!card) continue;
      const player = info.players[color];
      const isMe = color === COLOR_NAME[this.myColor];
      $(".player-name", card).textContent = isMe ? `${player.name} (you)` : player.name;
      $(".player-rating", card).textContent = player.isBot
        ? capitalize(info.bot?.difficulty || "bot")
        : (player.rating ?? "");
    }

    const badges = [info.timeControl, info.rated ? "Rated" : "Unrated"];
    if (info.mode === "bot")
      badges.push(`Bot · ${capitalize(info.bot.difficulty)} · ${info.bot.personality}`);
    else badges.push("Online");
    $("#game-badges").replaceChildren(
      ...badges.map((text) => el("span", { class: "board-status", text })),
    );

    const isOnline = info.mode === "online";
    show($("#draw-offer-button"), isOnline);
    this.setChatAvailable(isOnline);
  }

  onStart() {
    stopSearchTimer();
    showScreen("game-area");
    this.live = true;
    this.finished = false;
    this.board.setInteractive(true);
    show($("#game-controls"), true);
    show($("#post-game-controls"), false);
    setMatchLock(true);
    playSound("gameStart");
    this.renderTurn();
    announce(`Game started. You are ${COLOR_NAME[this.myColor]}.`);
  }

  onBoard(fen) {
    this.fen = fen;
    this.board.setPosition(fen);
    this.renderTurn();
    this.tryPremove();
  }

  onHistory(moves) {
    const isNewMove = moves.length === this.moves.length + 1;
    this.moves = moves;
    const last = moves[moves.length - 1] || null;
    this.board.setLastMove(last);
    renderMoveList($("#move-history"), moves);

    if (isNewMove && last) {
      const mine = last.color === this.myColor;
      playSound(soundForMove(last, mine));
      announce(`${capitalize(COLOR_NAME[last.color])} played ${last.san}`);
    }
  }

  tryPremove() {
    const premove = this.board.premove;
    if (!premove || !this.live) return;
    if (new Chess(this.fen).turn() !== this.myColor) return;

    this.board.setPremove(null);
    const legal = new Chess(this.fen)
      .moves({ verbose: true })
      .find(
        (move) =>
          move.from === premove.from &&
          move.to === premove.to &&
          (!move.promotion || move.promotion === (premove.promotion || "q")),
      );
    if (legal) {
      playSound("premove");
      this.sendMove({ from: legal.from, to: legal.to, promotion: legal.promotion });
    }
  }

  sendMove(move) {
    if (!this.live) return;
    this.emit("move", move);
  }

  // ---- rendering -----------------------------------------------------------

  cardFor(color) {
    if (!this.myColor) return null;
    return color === COLOR_NAME[this.myColor] ? this.cards.bottom : this.cards.top;
  }

  assignCards() {
    const mine = COLOR_NAME[this.myColor];
    const theirs = COLOR_NAME[this.opponentColor];
    this.cards.bottom.dataset.color = mine;
    this.cards.top.dataset.color = theirs;
    this.clock = new Clock({
      [mine]: $(".timer", this.cards.bottom),
      [theirs]: $(".timer", this.cards.top),
    });
  }

  renderTurn() {
    const node = $("#turn-display");
    if (!node) return;
    if (this.finished) {
      node.textContent = "Game over";
      return;
    }
    const turn = new Chess(this.fen).turn();
    node.textContent =
      turn === this.myColor ? "Your move" : `${capitalize(COLOR_NAME[turn])} to move`;
    node.classList.toggle("is-my-turn", turn === this.myColor && this.live);

    const inCheck = new Chess(this.fen).inCheck();
    for (const color of ["white", "black"]) {
      const badge = $(
        ".check-badge",
        this.cardFor(color) || document.createElement("div"),
      );
      if (badge) show(badge, inCheck && COLOR_NAME[turn] === color);
    }
  }

  renderCaptured(captured) {
    // `captured.white` = pieces white has taken (black pieces), shown on white's card.
    for (const color of ["white", "black"]) {
      const card = this.cardFor(color);
      if (!card) continue;
      const pieceColor = color === "white" ? "b" : "w";
      $(".captured-pieces", card).replaceChildren(
        ...(captured[color] || []).map((type) =>
          el("img", {
            class: "captured-piece",
            src: pieceSrc(pieceColor, type),
            alt: PIECE_NAMES[type],
          }),
        ),
      );
    }
  }

  renderMaterial(scores) {
    const diff = (scores.w || 0) - (scores.b || 0);
    for (const color of ["white", "black"]) {
      const card = this.cardFor(color);
      if (!card) continue;
      const lead = color === "white" ? diff : -diff;
      $(".material-diff", card).textContent = lead > 0 ? `+${lead}` : "";
    }
  }

  renderDrawOffer(by) {
    const mine = COLOR_NAME[this.myColor];
    const banner = $("#draw-banner");
    const isOnline = this.info?.mode !== "bot";
    show(banner, Boolean(by) && by !== mine);
    show($("#draw-offer-button"), isOnline && !by);
    show($("#draw-withdraw-button"), by === mine);
    if (by && by !== mine) {
      $("#draw-banner-text").textContent = `${capitalize(by)} offers a draw.`;
      announce(`${capitalize(by)} offers a draw`);
    }
  }

  showMessage(text) {
    const node = $("#game-message");
    if (!node) return;
    node.textContent = text || "";
    show(node, Boolean(text));
  }

  flip() {
    this.orientation = this.orientation === "white" ? "black" : "white";
    this.board.setOrientation(this.orientation);
  }

  // ---- actions -------------------------------------------------------------

  async confirmResign() {
    if (!this.live) return;
    const confirmed = await confirmDialog({
      title: "Resign this game?",
      message: "Your opponent will be awarded the win.",
      confirmLabel: "Resign",
      variant: "danger",
    });
    if (confirmed && this.live) this.emit("resign");
  }

  async offerDraw() {
    if (!this.live) return;
    const confirmed = await confirmDialog({
      title: "Offer a draw?",
      message:
        "Your opponent can accept or decline. Making a move keeps the offer open.",
      confirmLabel: "Offer draw",
      variant: "info",
    });
    if (confirmed && this.live) this.emit("offerDraw");
  }

  // ---- game over -----------------------------------------------------------

  onGameOver(payload) {
    this.live = false;
    this.finished = true;
    this.board.setInteractive(false);
    this.board.setPremove(null);
    setMatchLock(false);
    show($("#game-controls"), false);
    show($("#post-game-controls"), true);
    this.renderDrawOffer(null);
    this.renderTurn();
    dismissToast("opponent-connection");
    playSound("gameEnd");

    const mine = COLOR_NAME[this.myColor];
    let title = "Draw";
    if (!payload.result) title = "Game aborted";
    else if (payload.result === mine) title = "You won!";
    else if (payload.result !== "draw") title = "You lost";

    this.showMessage(payload.message);
    announce(`${title}. ${payload.reason || ""}`);

    const ratingLine = el("p", { class: "result-rating" });
    const body = el("div", { class: "result-body" }, [
      el("p", { class: "result-reason", text: payload.reason || payload.message }),
      ratingLine,
    ]);

    const actions = [
      { label: "Play again", value: "again", variant: "primary", autofocus: true },
    ];
    if (payload.gameId)
      actions.push({ label: "Review game", value: "review", variant: "ghost" });
    actions.push({ label: "Close", value: null, variant: "ghost" });

    this.endModal = openModal({ title, body, actions, className: "modal-result" });
    this.endModal.ratingLine = ratingLine;
    this.renderRatingLine(payload.rated);

    this.endModal.result.then((choice) => {
      this.endModal = null;
      if (choice === "again") this.onPlayAgain();
      if (choice === "review")
        window.location.assign(`/games/${encodeURIComponent(payload.gameId)}`);
    });
  }

  renderRatingLine(rated) {
    const line = this.endModal?.ratingLine;
    if (!line) return;
    if (this.ratingUpdate) {
      const { rating, delta } = this.ratingUpdate;
      const sign = delta > 0 ? "+" : "";
      line.textContent = `New rating: ${rating} (${sign}${delta})`;
      line.dataset.trend = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    } else {
      line.textContent = rated
        ? "Updating rating…"
        : "Unrated game: your rating is unchanged.";
    }
  }

  onRatingUpdate(payload) {
    this.ratingUpdate = payload;
    const topbarRating = $("#user-rating-value");
    if (topbarRating) topbarRating.textContent = payload.rating;
    this.renderRatingLine(true);
  }

  // ---- chat ----------------------------------------------------------------

  clearChat(text = "No messages yet.") {
    $("#chat-messages")?.replaceChildren(el("p", { class: "empty-note", text }));
  }

  /** Chat is always visible so it's discoverable; it only works in online games. */
  setChatAvailable(available) {
    show($("#opponent-chat-panel"), true);
    const input = $("#chat-input");
    const send = $("#chat-form button[type=submit]");
    if (input) {
      input.disabled = !available;
      input.value = "";
      input.placeholder = available ? "Say something…" : "Chat is off in bot games";
    }
    if (send) send.disabled = !available;
    this.clearChat(
      available
        ? "No messages yet."
        : "Chat is available in online games against another player.",
    );
  }

  appendChat({ message, sender }) {
    const list = $("#chat-messages");
    if (!list || !message) return;
    list.querySelector(".empty-note")?.remove();
    const isOwn = sender?.color === this.myColor;
    list.append(
      el("div", { class: `chat-row ${isOwn ? "ours" : "theirs"}` }, [
        el("span", {
          class: "chat-sender",
          text: isOwn ? "You" : sender?.name || "Opponent",
        }),
        el("div", { class: "chat-bubble", text: message }),
      ]),
    );
    list.scrollTop = list.scrollHeight;
    if (!isOwn) playSound("notify");
  }

  sendChat(event) {
    event.preventDefault();
    const input = $("#chat-input");
    if (!input || input.disabled) return;
    const message = input.value.trim();
    if (!message) return;
    this.emit("chatMessage", { message });
    input.value = "";
  }
}
