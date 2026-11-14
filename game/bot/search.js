const { Chess } = require("chess.js");
const { pieceValues } = require("../constants");

// depth = maximum iterative-deepening depth; budgetMs = search time budget;
// thinkTimeMs = minimum perceived "thinking" delay before the bot replies.
const DIFFICULTY_CONFIG = {
  easy: {
    depth: 1,
    budgetMs: 150,
    blunderChance: 0.28,
    topChoicePool: 4,
    choiceMargin: 1.5,
    maxBranches: 12,
    thinkTimeMs: 350,
  },
  medium: {
    depth: 2,
    budgetMs: 500,
    blunderChance: 0.1,
    topChoicePool: 3,
    choiceMargin: 0.6,
    maxBranches: 20,
    thinkTimeMs: 650,
  },
  hard: {
    depth: 4,
    budgetMs: 1500,
    blunderChance: 0.02,
    topChoicePool: 2,
    choiceMargin: 0.25,
    maxBranches: 28,
    thinkTimeMs: 900,
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

const MATE_SCORE = 100000;
const SEARCH_TIMEOUT = Symbol("search-timeout");

const pickRandom = (items) => items[Math.floor(Math.random() * items.length)];

const normalizeDifficulty = (difficulty) =>
  Object.hasOwn(DIFFICULTY_CONFIG, difficulty) ? difficulty : "medium";

const normalizePersonality = (personality) =>
  Object.hasOwn(PERSONALITY_WEIGHTS, personality) ? personality : "positional";

const getDifficultyConfig = (difficulty) => {
  const key = normalizeDifficulty(difficulty);
  return { ...DIFFICULTY_CONFIG[key], key };
};

/** Static evaluation from `botColor`'s perspective (pawn = 1). */
const evaluateBoard = (chess, botColor, weights) => {
  let material = 0;
  let center = 0;
  const board = chess.board();

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (!piece) continue;
      const sign = piece.color === botColor ? 1 : -1;
      material += sign * (pieceValues[piece.type] || 0);
      if (row >= 2 && row <= 5 && col >= 2 && col <= 5) {
        center += sign * (piece.type === "p" ? 0.35 : 0.2);
      }
    }
  }

  // One move generation for the side to move (cheap proxy for mobility).
  const sideSign = chess.turn() === botColor ? 1 : -1;
  const mobility = sideSign * chess.moves().length * 0.04;
  const kingSafety = chess.inCheck() ? -sideSign * 0.9 : 0;

  return (
    weights.material * material +
    weights.center * center +
    weights.mobility * mobility +
    weights.kingSafety * kingSafety
  );
};

const scoreMove = (move, weights) => {
  let score = 0;
  if (move.captured) score += 120 + (pieceValues[move.captured] || 0) * 4;
  if (move.promotion) score += 90;
  if (move.san?.includes("#")) score += 50000;
  else if (move.san?.includes("+")) score += 45;
  if (move.flags?.includes("k") || move.flags?.includes("q")) score += 12;
  if (move.captured || move.san?.includes("+") || move.san?.includes("#")) {
    score *= weights.initiative;
  }
  return score;
};

const orderMoves = (moves, weights, maxBranches) =>
  moves
    .map((move) => ({ move, score: scoreMove(move, weights) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxBranches)
    .map((item) => item.move);

const minimax = (chess, depth, alpha, beta, ply, ctx) => {
  if ((++ctx.nodes & 63) === 0 && Date.now() > ctx.deadline) {
    throw SEARCH_TIMEOUT;
  }

  if (chess.isCheckmate()) {
    // Prefer faster mates and slower losses.
    return chess.turn() === ctx.botColor ? -MATE_SCORE + ply : MATE_SCORE - ply;
  }
  if (chess.isDraw() || chess.isStalemate()) return 0;
  if (depth === 0) return evaluateBoard(chess, ctx.botColor, ctx.weights);

  const maximizing = chess.turn() === ctx.botColor;
  const moves = orderMoves(
    chess.moves({ verbose: true }),
    ctx.weights,
    ctx.maxBranches,
  );
  let best = maximizing ? -Infinity : Infinity;

  for (const move of moves) {
    chess.move({ from: move.from, to: move.to, promotion: move.promotion });
    let value;
    try {
      value = minimax(chess, depth - 1, alpha, beta, ply + 1, ctx);
    } finally {
      chess.undo();
    }

    if (maximizing) {
      best = Math.max(best, value);
      alpha = Math.max(alpha, value);
    } else {
      best = Math.min(best, value);
      beta = Math.min(beta, value);
    }
    if (beta <= alpha) break;
  }
  return best;
};

const searchRoot = (chess, rootMoves, depth, ctx) =>
  rootMoves.map((move) => {
    chess.move({ from: move.from, to: move.to, promotion: move.promotion });
    let value;
    try {
      value = minimax(chess, depth - 1, -Infinity, Infinity, 1, ctx);
    } finally {
      chess.undo();
    }
    // Tiny ordering bonus breaks ties with personality flavour.
    return { move, value: value + scoreMove(move, ctx.weights) * 0.0002 };
  });

const toMoveInput = (move) =>
  move ? { from: move.from, to: move.to, promotion: move.promotion } : null;

/**
 * Pick a move for the side to move. Synchronous and CPU bound: production code
 * runs it inside a worker thread (see ./pool.js).
 * Accepts a chess.js instance or a FEN string.
 */
const getBotMove = (chessOrFen, options = {}) => {
  const chess = typeof chessOrFen === "string" ? new Chess(chessOrFen) : chessOrFen;
  const config = getDifficultyConfig(options.difficulty);
  const weights = PERSONALITY_WEIGHTS[normalizePersonality(options.personality)];
  const botColor = options.botColor || chess.turn();

  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return null;

  const blunderChance = options.blunderChance ?? config.blunderChance;
  if (Math.random() < blunderChance) {
    const shuffled = [...moves].sort(() => Math.random() - 0.5);
    return toMoveInput(pickRandom(shuffled.slice(0, Math.min(6, shuffled.length))));
  }

  const ctx = {
    botColor,
    weights,
    maxBranches: config.maxBranches,
    deadline: Date.now() + (options.budgetMs ?? config.budgetMs),
    nodes: 0,
  };
  const rootMoves = orderMoves(moves, weights, moves.length);

  let scored = null;
  for (let depth = 1; depth <= config.depth; depth++) {
    try {
      scored = searchRoot(chess, rootMoves, depth, ctx);
    } catch (error) {
      if (error !== SEARCH_TIMEOUT) throw error;
      break; // keep the last fully searched depth
    }
    scored.sort((a, b) => b.value - a.value);
    if (scored[0].value >= MATE_SCORE - 100) break; // forced mate found
  }

  if (!scored) {
    return toMoveInput(rootMoves[0]);
  }

  const bestValue = scored[0].value;
  const pool = scored
    .slice(0, Math.min(config.topChoicePool, scored.length))
    .filter((item) => item.value >= bestValue - config.choiceMargin);
  return toMoveInput(pickRandom(pool).move);
};

module.exports = {
  DIFFICULTY_CONFIG,
  getBotMove,
  getDifficultyConfig,
  normalizeDifficulty,
  normalizePersonality,
};
