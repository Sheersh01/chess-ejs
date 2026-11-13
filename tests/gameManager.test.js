const gameManager = require("../game/gameManager");

describe("gameManager", () => {
  beforeEach(() => {
    for (const id of Array.from(gameManager.games.keys())) gameManager.cleanupGame(id);
  });

  test("creates a game in countdown with the chosen time control", () => {
    const game = gameManager.createGame("sw", "sb", "uw", "ub", { timeControl: "3+2" });

    expect(game.id).toMatch(/^game_/);
    expect(game.status).toBe("countdown");
    expect(game.clock.remainingMs.white).toBe(180000);
    expect(game.clock.incrementMs).toBe(2000);
    expect(game.isFinished).toBe(false);
    expect(gameManager.getGameBySocket("sw")).toBe(game);
    expect(gameManager.getGameByUserId("uw")).toBe(game);
  });

  test("only games between two registered users are rated", () => {
    const id1 = "507f1f77bcf86cd799439011";
    const id2 = "507f1f77bcf86cd799439012";
    expect(gameManager.createGame("a", "b", id1, id2).rated).toBe(true);
    expect(gameManager.createGame("c", "d", id1, "guest_1").rated).toBe(false);
    expect(
      gameManager.createGame("e", "bot_engine", id2, "bot_engine", {
        isBotGame: true,
        botColor: "b",
      }).rated,
    ).toBe(false);
  });

  test("reconnects player with new socket id", () => {
    const game = gameManager.createGame("sw_old", "sb", "uw", "ub");
    gameManager.socketToGame.delete("sw_old");

    const result = gameManager.reconnectPlayer("uw", "sw_new");
    expect(result.reconnectedColor).toBe("white");
    expect(game.players.white).toBe("sw_new");
    expect(gameManager.getGameBySocket("sw_new")).toBe(game);
  });

  test("cleaning up an old game does not untrack the user's new game", () => {
    const oldGame = gameManager.createGame("s1", "s2", "u1", "u2");
    oldGame.isFinished = true;
    const newGame = gameManager.createGame("s3", "s4", "u1", "u5");

    gameManager.cleanupGame(oldGame.id);
    expect(gameManager.getGameByUserId("u1")).toBe(newGame);
    expect(gameManager.isUserInActiveGame("u1")).toBe(true);
  });

  test("counts active games and players", () => {
    gameManager.createGame("s1", "s2", "u1", "u2");
    gameManager.createGame("s3", "bot_engine", "u3", "bot_engine", {
      isBotGame: true,
      botColor: "b",
    });

    expect(gameManager.getActiveGameCount()).toBe(2);
    expect(gameManager.getActivePlayerCount()).toBe(3);
  });
});
