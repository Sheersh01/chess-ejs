const { Chess } = require("chess.js");
const { monitorEventLoopDelay } = require("perf_hooks");
const botManager = require("../game/botManager");

const MIDDLEGAME =
  "r2q1rk1/pp2bppp/2np1n2/2p1p3/2P1P1b1/2NP1NP1/PP2QPBP/R1B2RK1 w - - 0 9";

describe("botManager", () => {
  afterAll(() => botManager.shutdown());

  test("normalizes unknown difficulty and personality", () => {
    expect(botManager.normalizeDifficulty("unknown")).toBe("medium");
    expect(botManager.normalizeDifficulty("hard")).toBe("hard");
    expect(botManager.normalizePersonality("unknown")).toBe("positional");
    expect(botManager.normalizePersonality("aggressive")).toBe("aggressive");
  });

  test("returns a legal move from the starting position", () => {
    const chess = new Chess();
    const move = botManager.getBotMove(chess, { difficulty: "easy", botColor: "w" });
    expect(() => chess.move(move)).not.toThrow();
  });

  test("finds mate in one", () => {
    const fen = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";
    for (let i = 0; i < 5; i++) {
      const move = botManager.getBotMove(fen, { difficulty: "hard", blunderChance: 0 });
      expect(move).toMatchObject({ from: "a1", to: "a8" });
    }
  });

  test("respects its search time budget", () => {
    const started = Date.now();
    botManager.getBotMove(MIDDLEGAME, { difficulty: "hard", blunderChance: 0 });
    const budget = botManager.getDifficultyConfig("hard").budgetMs;
    expect(Date.now() - started).toBeLessThan(budget + 500);
  });

  test("async search runs off the main thread", async () => {
    const histogram = monitorEventLoopDelay({ resolution: 10 });
    histogram.enable();
    const move = await botManager.getBotMoveAsync(MIDDLEGAME, { difficulty: "hard" });
    histogram.disable();

    expect(() => new Chess(MIDDLEGAME).move(move)).not.toThrow();
    expect(histogram.max / 1e6).toBeLessThan(150); // ms
  });
});
