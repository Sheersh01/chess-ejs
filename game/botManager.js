const { Chess } = require("chess.js");
const { pieceValues } = require("./constants");

const pickRandom = (items) => items[Math.floor(Math.random() * items.length)];

const DIFFICULTY_CONFIG = {
  easy: {
    depth: 1,
    blunderChance: 0.28,
    topChoicePool: 4,
    maxBranches: 12,
    thinkTimeMs: 350,
  },
  medium: {
    depth: 2,
    blunderChance: 0.1,
    topChoicePool: 3,
    maxBranches: 20,
    thinkTimeMs: 650,
  },
  hard: {
    depth: 3,
    blunderChance: 0.02,
    topChoicePool: 2,
    maxBranches: 28,
    thinkTimeMs: 1000,
  },
};

const PERSONALITY_WEIGHTS = {
  aggressive: {
    material: 1,
    mobility: 0.6,
    center: 0.7,
    kingSafety: 0.8,
    initiative: 1.35,
  },
  positional: {
    material: 1,
    mobility: 0.9,
    center: 1.2,
    kingSafety: 1,
    initiative: 0.9,
  },
  defensive: {
    material: 1.05,
    mobility: 0.7,
    center: 0.8,
    kingSafety: 1.4,
    initiative: 0.75,
  },
};

const normalizeDifficulty = (difficulty) =>
  DIFFICULTY_CONFIG[difficulty] ? difficulty : "medium";

const normalizePersonality = (personality) =>
  PERSONALITY_WEIGHTS[personality] ? personality : "positional";

const getDifficultyConfig = (difficulty) => {
  const key = normalizeDifficulty(difficulty);
  return { ...DIFFICULTY_CONFIG[key], key };
};

const fenWithTurn = (fen, turn) => {
  const fields = fen.split(" ");
  const originalTurn = fields[1];
  fields[1] = turn;

  // Switching sides can invalidate the en-passant target square from the
  // original position, so clear it for read-only evaluation clones.
  if (originalTurn !== turn) {
    fields[3] = "-";
  }

  return fields.join(" ");
};

const getMovesForColor = (chess, color) => {
  if (chess.turn() === color) {
    return chess.moves({ verbose: true });
  }
  const temp = new Chess(fenWithTurn(chess.fen(), color));
  return temp.moves({ verbose: true });
};

const isInCheck = (chess) => {
  if (typeof chess.inCheck === "function") {
    return chess.inCheck();
  }
  if (typeof chess.in_check === "function") {
    return chess.in_check();
  }
  return false;
};

const evaluateBoard = (chess, perspectiveColor, personality) => {
  const weights = PERSONALITY_WEIGHTS[normalizePersonality(personality)];
  const board = chess.board();
  let materialScore = 0;
  let centerScore = 0;

  for (let row = 0; row < board.length; row++) {
    for (let col = 0; col < board[row].length; col++) {
      const piece = board[row][col];
      if (!piece) {
        continue;
      }

      const sign = piece.color === perspectiveColor ? 1 : -1;
      materialScore += sign * (pieceValues[piece.type] || 0);

      const isCenter = row >= 2 && row <= 5 && col >= 2 && col <= 5;
      if (isCenter) {
        const centerValue = piece.type === "p" ? 0.35 : 0.2;
        centerScore += sign * centerValue;
      }
    }
  }

  const ownMobility = getMovesForColor(chess, perspectiveColor).length;
  const oppColor = perspectiveColor === "w" ? "b" : "w";
  const oppMobility = getMovesForColor(chess, oppColor).length;
  const mobilityScore = (ownMobility - oppMobility) * 0.08;

  let kingSafetyScore = 0;
  if (isInCheck(chess)) {
    kingSafetyScore = chess.turn() === perspectiveColor ? -0.9 : 0.9;
  }

  return (
    weights.material * materialScore +
    weights.center * centerScore +
    weights.mobility * mobilityScore +
    weights.kingSafety * kingSafetyScore
  );
};

const scoreMove = (move, personality) => {
  const weights = PERSONALITY_WEIGHTS[normalizePersonality(personality)];
  let score = 0;

  if (move.captured) {
    score += 120 + (pieceValues[move.captured] || 0) * 4;
  }

  if (move.promotion) {
    score += 90;
  }

  if (move.san?.includes("#")) {
    score += 50000;
  } else if (move.san?.includes("+")) {
    score += 45;
  }

  if (move.flags?.includes("k") || move.flags?.includes("q")) {
    score += 12;
  }

  // Personality-driven initiative preference in move ordering.
  if (move.captured || move.san?.includes("+") || move.san?.includes("#")) {
    score *= weights.initiative;
  }

  return score;
};

const minimax = (
  chess,
  depth,
  alpha,
  beta,
  maximizing,
  botColor,
  personality,
  maxBranches,
) => {
  if (depth === 0 || chess.isGameOver()) {
    if (chess.isCheckmate()) {
      const mateScore = chess.turn() === botColor ? -100000 : 100000;
      return mateScore;
    }
    if (chess.isDraw()) {
      return 0;
    }
    return evaluateBoard(chess, botColor, personality);
  }

  let moves = chess.moves({ verbose: true });
  moves = moves
    .map((move) => ({ move, score: scoreMove(move, personality) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxBranches)
    .map((item) => item.move);

  if (maximizing) {
    let best = -Infinity;
    for (const move of moves) {
      chess.move({ from: move.from, to: move.to, promotion: move.promotion });
      const evalScore = minimax(
        chess,
        depth - 1,
        alpha,
        beta,
        false,
        botColor,
        personality,
        maxBranches,
      );
      chess.undo();
      best = Math.max(best, evalScore);
      alpha = Math.max(alpha, evalScore);
      if (beta <= alpha) {
        break;
      }
    }
    return best;
  }

  let best = Infinity;
  for (const move of moves) {
    chess.move({ from: move.from, to: move.to, promotion: move.promotion });
    const evalScore = minimax(
      chess,
      depth - 1,
      alpha,
      beta,
      true,
      botColor,
      personality,
      maxBranches,
    );
    chess.undo();
    best = Math.min(best, evalScore);
    beta = Math.min(beta, evalScore);
    if (beta <= alpha) {
      break;
    }
  }
  return best;
};

const getBotMove = (chess, options = {}) => {
  const difficulty = normalizeDifficulty(options.difficulty);
  const personality = normalizePersonality(options.personality);
  const config = getDifficultyConfig(difficulty);
  const botColor = options.botColor || chess.turn();

  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) {
    return null;
  }

  // Intentionally weaker play on easier levels.
  if (Math.random() < config.blunderChance) {
    const shuffled = [...moves].sort(() => Math.random() - 0.5);
    return pickRandom(shuffled.slice(0, Math.min(6, shuffled.length)));
  }

  const scored = [];
  for (const move of moves) {
    chess.move({ from: move.from, to: move.to, promotion: move.promotion });
    const isBotTurn = chess.turn() === botColor;
    const value = minimax(
      chess,
      config.depth - 1,
      -Infinity,
      Infinity,
      isBotTurn,
      botColor,
      personality,
      config.maxBranches,
    );
    chess.undo();

    // Move-ordering bonus to break ties with personality flavor.
    const ordering = scoreMove(move, personality) * 0.02;
    scored.push({ move, value: value + ordering });
  }

  scored.sort((a, b) => b.value - a.value);
  const topPool = scored.slice(0, Math.min(config.topChoicePool, scored.length));
  return pickRandom(topPool).move;
};

module.exports = {
  getBotMove,
  getDifficultyConfig,
  normalizeDifficulty,
  normalizePersonality,
};
