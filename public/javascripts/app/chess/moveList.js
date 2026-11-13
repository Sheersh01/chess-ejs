import { el } from "../core/dom.js";
import { pieceSrc } from "./pieces.js";

/**
 * Renders a numbered move list. `onSelect(plyIndex)` makes moves clickable
 * (replay); `active` highlights the current ply (defaults to the last one).
 */
export const renderMoveList = (
  container,
  moves,
  { active = moves.length - 1, onSelect } = {},
) => {
  if (!container) return;

  if (moves.length === 0) {
    container.replaceChildren(el("p", { class: "empty-note", text: "No moves yet." }));
    return;
  }

  const moveCell = (move, ply) => {
    if (!move) return el("span", { class: "move-cell is-empty" });
    const content = [
      el("img", {
        class: "move-piece",
        src: pieceSrc(move.color, move.piece),
        alt: "",
      }),
      el("span", { text: move.san }),
    ];
    const props = {
      class: `move-cell${ply === active ? " is-active" : ""}`,
      "aria-current": ply === active ? "step" : null,
    };
    if (!onSelect) return el("span", props, content);
    return el(
      "button",
      {
        ...props,
        type: "button",
        "aria-label": `Move ${Math.floor(ply / 2) + 1}${move.color === "w" ? "" : "…"} ${move.san}`,
        onClick: () => onSelect(ply),
      },
      content,
    );
  };

  const rows = [];
  for (let ply = 0; ply < moves.length; ply += 2) {
    rows.push(
      el("li", { class: "move-row" }, [
        el("span", { class: "move-no", text: `${ply / 2 + 1}.` }),
        moveCell(moves[ply], ply),
        moveCell(moves[ply + 1], ply + 1),
      ]),
    );
  }

  container.replaceChildren(el("ol", { class: "move-rows" }, rows));
  // Scroll only the list (never the page) to keep the current move in view.
  // The container is position: relative, so offsetTop is relative to it.
  const current = container.querySelector(".is-active");
  container.scrollTop = current
    ? current.offsetTop - container.clientHeight / 2
    : container.scrollHeight;
};
