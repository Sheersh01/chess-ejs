const colorKey = (color) => (color === "white" || color === "w" ? "w" : "b");

const getNonKingPieces = (chess, color) => {
  const target = colorKey(color);
  const pieces = [];
  for (const row of chess.board()) {
    for (const square of row) {
      if (square && square.color === target && square.type !== "k") {
        pieces.push(square.type);
      }
    }
  }
  return pieces;
};

/**
 * Whether `color` could still deliver checkmate, used to decide flag-fall results.
 * Follows the common online-chess interpretation of FIDE 6.9: a bare king, or a
 * king with a single minor piece against a bare king, cannot win on time.
 */
const hasMatingMaterial = (chess, color) => {
  const own = getNonKingPieces(chess, color);
  if (own.length === 0) {
    return false;
  }

  const onlyOneMinor = own.length === 1 && (own[0] === "n" || own[0] === "b");
  if (onlyOneMinor) {
    const opponent = getNonKingPieces(chess, colorKey(color) === "w" ? "b" : "w");
    return opponent.length > 0;
  }

  return true;
};

module.exports = { hasMatingMaterial };
