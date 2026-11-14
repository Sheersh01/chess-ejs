const { computeElo, kFactor } = require("../services/playerResultService");

describe("computeElo", () => {
  test("equal players: win/loss changes are equal and opposite", () => {
    expect(computeElo(1200, 1200, 1, 20)).toBe(10);
    expect(computeElo(1200, 1200, 0, 20)).toBe(-10);
  });

  test("both deltas come from pre-game ratings (symmetric)", () => {
    const whiteDelta = computeElo(1500, 1300, 0, 20);
    const blackDelta = computeElo(1300, 1500, 1, 20);
    expect(whiteDelta + blackDelta).toBe(0);
    expect(blackDelta).toBeGreaterThan(10); // an upset is worth more than an even win
  });

  test("draw between equals changes nothing", () => {
    expect(computeElo(1200, 1200, 0.5, 40)).toBe(0);
  });

  test("provisional players use a larger K", () => {
    expect(kFactor(0)).toBe(40);
    expect(kFactor(29)).toBe(40);
    expect(kFactor(30)).toBe(20);
  });
});
