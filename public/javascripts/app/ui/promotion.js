import { el } from "../core/dom.js";
import { openModal } from "./modal.js";
import { PIECE_NAMES, pieceSrc } from "../chess/pieces.js";

/** Ask which piece to promote to. Resolves "q" | "r" | "b" | "n" | null. */
export const choosePromotion = (color) => {
  let close;
  const choices = el(
    "div",
    { class: "promotion-choices" },
    ["q", "r", "b", "n"].map((type) =>
      el(
        "button",
        {
          type: "button",
          class: "promotion-choice",
          "aria-label": `Promote to ${PIECE_NAMES[type]}`,
          onClick: () => close(type),
        },
        [el("img", { src: pieceSrc(color, type), alt: "" })],
      ),
    ),
  );

  const modal = openModal({
    title: "Promote pawn",
    body: choices,
    actions: [{ label: "Cancel", value: null, variant: "ghost" }],
    className: "modal-compact",
  });
  close = modal.close;
  choices.querySelector("button")?.focus();
  return modal.result;
};
