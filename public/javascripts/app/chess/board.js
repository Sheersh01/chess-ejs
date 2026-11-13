import { Chess } from "/vendor/chess.js/chess.js";
import { el } from "../core/dom.js";
import { FILES, pieceLabel, pieceSrc, squaresFor } from "./pieces.js";

const DRAG_THRESHOLD_PX = 4;

/** FEN with the side to move swapped (for premove destinations). */
const flipTurn = (fen) => {
  const parts = fen.split(" ");
  parts[1] = parts[1] === "w" ? "b" : "w";
  parts[3] = "-";
  return parts.join(" ");
};

/**
 * Interactive chessboard. Rendering is driven by a chess.js instance; moves are
 * reported through callbacks, never applied locally (the server is authoritative).
 *
 * Options:
 *  - onMove({from, to, promotion})       a legal move for the side to move
 *  - onPremove({from, to} | null)        premove queued / cleared
 *  - requestPromotion(color) => Promise<"q"|"r"|"b"|"n"|null>
 *  - onIllegal()                          an illegal destination was chosen
 */
export class Board {
  constructor(root, options = {}) {
    this.root = root;
    this.options = options;
    this.chess = new Chess();
    this.orientation = "white";
    this.playerColor = null; // "w" | "b" | null (spectator / replay)
    this.interactive = false;
    this.lastMove = null;
    this.premove = null;
    this.selected = null;
    this.focusSquare = "e2";
    this.drag = null;

    root.classList.add("board");
    root.setAttribute("role", "group");
    root.setAttribute(
      "aria-label",
      "Chess board. Use arrow keys to move between squares, Enter to select and move.",
    );

    root.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    root.addEventListener("click", (event) => this.onKeyboardClick(event));
    root.addEventListener("keydown", (event) => this.onKeyDown(event));
    // Remember where keyboard focus is so re-renders keep it in place.
    root.addEventListener("focusin", (event) => {
      const square = this.squareFromEvent(event);
      if (square) this.focusSquare = square;
    });
    root.addEventListener("contextmenu", (event) => {
      if (this.selected || this.premove) {
        event.preventDefault();
        this.clearSelection();
        this.setPremove(null, true);
      }
    });
    window.addEventListener("pointermove", (event) => this.onPointerMove(event));
    window.addEventListener("pointerup", (event) => this.onPointerUp(event));
    window.addEventListener("pointercancel", () => this.cancelDrag());

    this.render();
  }

  // ---- state setters -------------------------------------------------------

  setPosition(fenOrChess) {
    this.chess =
      typeof fenOrChess === "string"
        ? new Chess(fenOrChess)
        : fenOrChess || new Chess();
    if (this.selected && this.chess.get(this.selected)?.color !== this.playerColor) {
      this.selected = null;
    }
    this.render();
  }

  setOrientation(orientation) {
    this.orientation = orientation === "black" ? "black" : "white";
    this.render();
  }

  setPlayerColor(color) {
    this.playerColor = color;
    this.focusSquare = color === "b" ? "e7" : "e2";
    this.render();
  }

  setInteractive(interactive) {
    this.interactive = Boolean(interactive);
    if (!this.interactive) {
      this.selected = null;
      this.cancelDrag();
    }
    this.render();
  }

  setLastMove(move) {
    this.lastMove = move ? { from: move.from, to: move.to } : null;
    this.render();
  }

  setPremove(premove, notify = false) {
    this.premove = premove;
    if (notify) this.options.onPremove?.(premove);
    this.render();
  }

  clearSelection() {
    this.selected = null;
    this.render();
  }

  // ---- move helpers --------------------------------------------------------

  isMyTurn() {
    return this.playerColor !== null && this.chess.turn() === this.playerColor;
  }

  ownsPiece(square) {
    const piece = this.chess.get(square);
    return Boolean(piece && piece.color === this.playerColor);
  }

  legalTargets(from) {
    if (!from) return [];
    if (this.isMyTurn()) {
      return this.chess.moves({ square: from, verbose: true });
    }
    // Premove destinations: moves as if it were our turn right now.
    try {
      const shadow = new Chess();
      shadow.load(flipTurn(this.chess.fen()), { skipValidation: true });
      return shadow.moves({ square: from, verbose: true });
    } catch {
      return [];
    }
  }

  async attemptMove(from, to) {
    this.selected = null;
    if (!this.interactive || from === to) {
      this.render();
      return;
    }

    const candidates = this.legalTargets(from).filter((move) => move.to === to);
    if (candidates.length === 0) {
      this.render();
      if (this.chess.get(to)?.color !== this.playerColor) this.options.onIllegal?.();
      return;
    }

    let promotion;
    if (candidates.some((move) => move.promotion)) {
      promotion = await this.options.requestPromotion?.(this.playerColor);
      if (!promotion) {
        this.render();
        return;
      }
    }

    if (this.isMyTurn()) {
      this.options.onMove?.({ from, to, ...(promotion && { promotion }) });
    } else {
      this.setPremove({ from, to, ...(promotion && { promotion }) }, true);
    }
    this.render();
  }

  /** Tap / click / keyboard activation of a square. */
  activate(square) {
    if (!this.interactive) return;
    if (this.selected === square) {
      this.clearSelection();
      return;
    }
    if (this.ownsPiece(square)) {
      this.selected = square;
      this.render();
      return;
    }
    if (this.selected) {
      this.attemptMove(this.selected, square);
    }
  }

  // ---- pointer input -------------------------------------------------------

  squareFromEvent(event) {
    const node = event.target.closest?.("[data-square]");
    return node && this.root.contains(node) ? node.dataset.square : null;
  }

  onPointerDown(event) {
    if (event.button !== 0 || !this.interactive) return;
    const square = this.squareFromEvent(event);
    if (!square) return;
    this.focusSquare = square;

    if (this.ownsPiece(square)) {
      event.preventDefault();
      const wasSelected = this.selected === square;
      this.selected = square;
      this.drag = {
        from: square,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        wasSelected,
        ghost: null,
      };
      this.render();
      return;
    }

    if (this.selected) {
      event.preventDefault();
      this.attemptMove(this.selected, square);
    }
  }

  onPointerMove(event) {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;

    const distance = Math.hypot(
      event.clientX - drag.startX,
      event.clientY - drag.startY,
    );
    if (!drag.moved && distance < DRAG_THRESHOLD_PX) return;

    if (!drag.moved) {
      drag.moved = true;
      const piece = this.chess.get(drag.from);
      const squareNode = this.root.querySelector(`[data-square="${drag.from}"]`);
      const size = squareNode?.getBoundingClientRect().width || 64;
      drag.ghost = el("img", {
        class: "drag-ghost",
        src: pieceSrc(piece.color, piece.type),
        alt: "",
      });
      drag.ghost.style.width = `${size}px`;
      drag.ghost.style.height = `${size}px`;
      document.body.append(drag.ghost);
      squareNode?.classList.add("is-drag-source");
    }

    drag.ghost.style.transform = `translate(${event.clientX}px, ${event.clientY}px) translate(-50%, -50%)`;
  }

  onPointerUp(event) {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.drag = null;
    drag.ghost?.remove();

    if (drag.moved) {
      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest?.("[data-square]");
      const to = target && this.root.contains(target) ? target.dataset.square : null;
      if (to && to !== drag.from) {
        this.attemptMove(drag.from, to);
        return;
      }
      this.render();
      return;
    }

    // A plain tap on an already-selected piece toggles it off.
    if (drag.wasSelected) this.clearSelection();
  }

  cancelDrag() {
    if (!this.drag) return;
    this.drag.ghost?.remove();
    this.drag = null;
    this.render();
  }

  // ---- keyboard input ------------------------------------------------------

  onKeyboardClick(event) {
    // Pointer clicks are handled on pointerdown; detail === 0 means Enter/Space.
    if (event.detail !== 0) return;
    const square = this.squareFromEvent(event);
    if (square) this.activate(square);
  }

  onKeyDown(event) {
    const square = this.squareFromEvent(event);
    if (!square) return;

    if (event.key === "Escape") {
      this.clearSelection();
      this.setPremove(null, true);
      return;
    }

    const deltas = {
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();

    // Arrow keys follow what the user sees, so invert for the black orientation.
    const sign = this.orientation === "white" ? 1 : -1;
    const file = FILES.indexOf(square[0]) + delta[0] * sign;
    const rank = Number(square[1]) + delta[1] * sign;
    if (file < 0 || file > 7 || rank < 1 || rank > 8) return;

    this.focusSquare = `${FILES[file]}${rank}`;
    this.render();
    this.root.querySelector(`[data-square="${this.focusSquare}"]`)?.focus();
  }

  // ---- rendering -----------------------------------------------------------

  checkSquare() {
    if (!this.chess.inCheck()) return null;
    const turn = this.chess.turn();
    for (const row of this.chess.board()) {
      for (const cell of row) {
        if (cell && cell.type === "k" && cell.color === turn) return cell.square;
      }
    }
    return null;
  }

  render() {
    const hadFocus = this.root.contains(document.activeElement);
    const targets = new Map(
      this.legalTargets(this.selected).map((move) => [move.to, move]),
    );
    const checked = this.checkSquare();
    const order = squaresFor(this.orientation);
    const bottomRank = order[63][1];
    const leftFile = order[0][0];

    const fragment = document.createDocumentFragment();
    order.forEach((square) => {
      const piece = this.chess.get(square);
      const isLight = (FILES.indexOf(square[0]) + Number(square[1])) % 2 === 1;
      const classes = ["sq", isLight ? "sq-light" : "sq-dark"];
      if (
        this.lastMove &&
        (square === this.lastMove.from || square === this.lastMove.to)
      ) {
        classes.push("is-last-move");
      }
      if (
        this.premove &&
        (square === this.premove.from || square === this.premove.to)
      ) {
        classes.push("is-premove");
      }
      if (square === this.selected) classes.push("is-selected");
      if (square === checked) classes.push("is-check");
      if (targets.has(square))
        classes.push(piece ? "is-capture-target" : "is-move-target");
      if (this.interactive && this.ownsPiece(square)) classes.push("is-own");
      if (this.drag?.moved && square === this.drag.from) classes.push("is-drag-source");

      const label = [square, pieceLabel(piece)];
      if (square === this.selected) label.push("selected");
      if (targets.has(square))
        label.push(piece ? "capture available" : "move available");

      const button = el(
        "button",
        {
          type: "button",
          class: classes.join(" "),
          dataset: { square },
          "aria-label": label.join(", "),
          tabindex: square === this.focusSquare ? "0" : "-1",
        },
        [
          piece
            ? el("img", {
                class: "sq-piece",
                src: pieceSrc(piece.color, piece.type),
                alt: "",
                draggable: "false",
              })
            : null,
          square[0] === leftFile
            ? el("span", {
                class: "coord coord-rank",
                "aria-hidden": "true",
                text: square[1],
              })
            : null,
          square[1] === bottomRank
            ? el("span", {
                class: "coord coord-file",
                "aria-hidden": "true",
                text: square[0],
              })
            : null,
        ],
      );
      fragment.append(button);
    });

    this.root.replaceChildren(fragment);
    this.root.classList.toggle("is-interactive", this.interactive);
    if (hadFocus) {
      this.root.querySelector(`[data-square="${this.focusSquare}"]`)?.focus();
    }
  }
}
