jest.mock("../services/playerResultService", () => ({
  recordResult: jest.fn().mockResolvedValue({ rated: false }),
}));
jest.mock("../services/gamePersistence", () => ({
  finalizeGameRecord: jest.fn().mockResolvedValue(),
}));

const gameManager = require("../game/gameManager");
const { endGame } = require("../game/gameLifecycle");
const { recordResult } = require("../services/playerResultService");
const { finalizeGameRecord } = require("../services/gamePersistence");

const fakeIo = () => {
  const emitted = [];
  return {
    emitted,
    to: () => ({ emit: (event, payload) => emitted.push([event, payload]) }),
  };
};

describe("endGame", () => {
  afterEach(() => {
    for (const id of Array.from(gameManager.games.keys())) gameManager.cleanupGame(id);
    jest.clearAllMocks();
  });

  test("is idempotent: concurrent calls produce one result", async () => {
    const io = fakeIo();
    const game = gameManager.createGame("s1", "s2", "u1", "u2");

    const [first, second] = await Promise.all([
      endGame(game, io, { result: "white", reason: "Black resigned" }),
      endGame(game, io, { result: "black", reason: "White resigned" }),
    ]);

    expect([first, second]).toEqual([true, false]);
    expect(io.emitted.filter(([event]) => event === "gameOver")).toHaveLength(1);
    expect(recordResult).toHaveBeenCalledTimes(1);
    expect(finalizeGameRecord).toHaveBeenCalledTimes(1);
  });

  test("notifies players even when persistence fails", async () => {
    recordResult.mockRejectedValueOnce(new Error("db down"));
    const io = fakeIo();
    const game = gameManager.createGame("s3", "s4", "u3", "u4");

    await endGame(game, io, { result: "draw", reason: "Draw by agreement" });

    expect(io.emitted.some(([event]) => event === "gameOver")).toBe(true);
    expect(game.isFinished).toBe(true);
    expect(game.cleanupTimeout).toBeTruthy();
  });
});
