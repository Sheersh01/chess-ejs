const gameManager = require("../game/gameManager");

describe("gameManager", () => {
  beforeEach(() => {
    gameManager.games.clear();
    gameManager.socketToGame.clear();
    gameManager.userIdToGame.clear();
  });

  test("creates a game with default timer state", () => {
    const game = gameManager.createGame(
      "socket_white",
      "socket_black",
      "user_white",
      "user_black",
    );

    expect(game.id).toMatch(/^game_/);
    expect(game.chess.fen()).toContain("rnbqkbnr");
    expect(game.timers.white).toBe(600);
    expect(game.isFinished).toBe(false);
    expect(gameManager.getGameBySocket("socket_white")).toBe(game);
    expect(gameManager.getGameByUserId("user_white")).toBe(game);
  });

  test("reconnects player with new socket id", () => {
    const game = gameManager.createGame(
      "socket_white_old",
      "socket_black",
      "user_white",
      "user_black",
    );

    gameManager.socketToGame.delete("socket_white_old");

    const result = gameManager.reconnectPlayer("user_white", "socket_white_new");
    expect(result).not.toBeNull();
    expect(result.reconnectedColor).toBe("white");
    expect(game.players.white).toBe("socket_white_new");
    expect(gameManager.getGameBySocket("socket_white_new")).toBe(game);
  });

  test("cleanup removes all mappings", () => {
    const game = gameManager.createGame(
      "socket_white",
      "socket_black",
      "user_white",
      "user_black",
    );

    gameManager.cleanupGame(game.id);
    expect(gameManager.games.has(game.id)).toBe(false);
    expect(gameManager.getGameByUserId("user_white")).toBeNull();
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
