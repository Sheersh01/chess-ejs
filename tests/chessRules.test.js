const { Chess } = require("chess.js");
const { hasMatingMaterial } = require("../game/chessRules");
const { timeoutResult } = require("../game/gameLifecycle");

describe("hasMatingMaterial", () => {
  test("bare king cannot mate", () => {
    const chess = new Chess("8/8/8/4k3/8/8/8/4K2Q w - - 0 1");
    expect(hasMatingMaterial(chess, "black")).toBe(false);
    expect(hasMatingMaterial(chess, "white")).toBe(true);
  });

  test("lone minor vs bare king cannot mate", () => {
    const chess = new Chess("8/8/8/4k3/8/8/8/4KN2 w - - 0 1");
    expect(hasMatingMaterial(chess, "white")).toBe(false);
  });

  test("lone minor vs king with material can still mate", () => {
    const chess = new Chess("8/8/8/4k3/4p3/8/8/4KN2 w - - 0 1");
    expect(hasMatingMaterial(chess, "white")).toBe(true);
  });

  test("a pawn is mating material", () => {
    const chess = new Chess("8/8/8/4k3/8/8/4P3/4K3 w - - 0 1");
    expect(hasMatingMaterial(chess, "white")).toBe(true);
  });
});

describe("timeoutResult", () => {
  test("flag fall against a side with no mating material is a draw", () => {
    const game = { chess: new Chess("8/8/8/4k3/8/8/8/4K2Q b - - 0 1") };
    expect(timeoutResult(game, "white").result).toBe("draw");
    expect(timeoutResult(game, "black").result).toBe("white");
  });
});
