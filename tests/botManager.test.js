const botManager = require("../game/botManager");
const { Chess } = require("chess.js");

describe("botManager", () => {
  test("normalizes unknown difficulty to medium", () => {
    expect(botManager.normalizeDifficulty("unknown")).toBe("medium");
    expect(botManager.normalizeDifficulty("hard")).toBe("hard");
  });

  test("normalizes unknown personality to positional", () => {
    expect(botManager.normalizePersonality("unknown")).toBe("positional");
    expect(botManager.normalizePersonality("aggressive")).toBe("aggressive");
  });

  test("returns a legal bot move from starting position", () => {
    const chess = new Chess();
    const move = botManager.getBotMove(chess, {
      difficulty: "easy",
      personality: "positional",
      botColor: "w",
    });

    expect(move).toBeTruthy();
    expect(move.from).toBeDefined();
    expect(move.to).toBeDefined();
  });

  test("difficulty config exposes depth and think time", () => {
    const config = botManager.getDifficultyConfig("hard");
    expect(config.depth).toBeGreaterThan(0);
    expect(config.thinkTimeMs).toBeGreaterThan(0);
  });
});
