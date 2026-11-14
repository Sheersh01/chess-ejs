export const PIECE_NAMES = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

export const COLOR_NAMES = { w: "white", b: "black" };

export const pieceSrc = (color, type) =>
  `/images/pieces/${color}${type.toUpperCase()}.svg`;

export const pieceLabel = (piece) =>
  piece ? `${COLOR_NAMES[piece.color]} ${PIECE_NAMES[piece.type]}` : "empty";

export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
export const RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"];

/** Squares in visual order (top-left to bottom-right) for an orientation. */
export const squaresFor = (orientation) => {
  const ranks = orientation === "white" ? [...RANKS].reverse() : RANKS;
  const files = orientation === "white" ? FILES : [...FILES].reverse();
  return ranks.flatMap((rank) => files.map((file) => `${file}${rank}`));
};
