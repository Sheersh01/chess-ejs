import { Chess } from "/vendor/chess.js/chess.js";
import { $, $$, el } from "../core/dom.js";
import { Board } from "../chess/board.js";
import { renderMoveList } from "../chess/moveList.js";
import { initShell } from "../ui/shell.js";
import { playSound, soundForMove } from "../ui/sounds.js";

const START_FEN = new Chess().fen();

const init = () => {
  initShell();
  const root = $("#replay");
  if (!root) return;

  const data = JSON.parse(root.dataset.replay || "{}");
  const game = new Chess();
  try {
    if (data.pgn) game.loadPgn(data.pgn);
  } catch {
    // Unreadable PGN: show the starting position with no moves.
  }
  const moves = game.history({ verbose: true });

  let ply = moves.length - 1; // open on the final position
  let orientation = data.orientation === "black" ? "black" : "white";
  const board = new Board($("#board"));

  const renderPlayers = () => {
    const top = orientation === "white" ? "black" : "white";
    const bottom = orientation === "white" ? "white" : "black";
    for (const [slot, color] of [
      ["#replay-top", top],
      ["#replay-bottom", bottom],
    ]) {
      $(slot).replaceChildren(
        el("span", { class: `color-dot color-dot-${color}`, "aria-hidden": "true" }),
        el("strong", { text: data[color] || color }),
      );
    }
  };

  const go = (target, { sound = false } = {}) => {
    ply = Math.max(-1, Math.min(moves.length - 1, target));
    const move = moves[ply] || null;
    board.setPosition(move ? move.after : START_FEN);
    board.setLastMove(move);
    renderMoveList($("#move-history"), moves, {
      active: ply,
      onSelect: (index) => go(index),
    });
    $("#replay-position").textContent = move
      ? `${Math.floor(ply / 2) + 1}${move.color === "w" ? "." : "…"} ${move.san}`
      : "Start";
    if (sound && move) playSound(soundForMove(move, true));

    for (const button of $$("[data-step]")) {
      const step = button.dataset.step;
      button.disabled =
        ((step === "start" || step === "prev") && ply < 0) ||
        ((step === "next" || step === "end") && ply >= moves.length - 1);
    }
  };

  const steps = {
    start: () => go(-1),
    prev: () => go(ply - 1, { sound: true }),
    next: () => go(ply + 1, { sound: true }),
    end: () => go(moves.length - 1),
  };

  for (const button of $$("[data-step]")) {
    button.addEventListener("click", () => steps[button.dataset.step]());
  }
  $("#replay-flip").addEventListener("click", () => {
    orientation = orientation === "white" ? "black" : "white";
    board.setOrientation(orientation);
    renderPlayers();
  });

  document.addEventListener("keydown", (event) => {
    if (event.target.closest("input, textarea, select, [data-square]")) return;
    const keys = { ArrowLeft: "prev", ArrowRight: "next", Home: "start", End: "end" };
    const step = keys[event.key];
    if (!step) return;
    event.preventDefault();
    steps[step]();
  });

  board.setOrientation(orientation);
  renderPlayers();
  go(ply);
};

init();
