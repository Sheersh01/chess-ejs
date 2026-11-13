const { monitorEventLoopDelay } = require("perf_hooks");
const User = require("../models/User");
const Game = require("../models/Game");
const {
  startTestServer,
  guestToken,
  createUser,
  waitFor,
  record,
  sleep,
  startMatch,
} = require("./helpers/testServer");

jest.setTimeout(20000);

let server;

beforeAll(async () => {
  server = await startTestServer();
});

afterAll(async () => {
  await server.close();
});

describe("game flow over sockets", () => {
  test("two guests are matched and moves are relayed", async () => {
    const a = await server.connect(guestToken());
    const b = await server.connect(guestToken());
    const { white, black } = await startMatch(a, b);

    const boardForBlack = waitFor(black, "boardstate", {
      filter: (fen) => fen.includes("4P3"),
    });
    white.emit("move", { from: "e2", to: "e4" });
    await boardForBlack;

    white.emit("resign");
    await waitFor(black, "gameOver");
  });

  test("resigning twice ends the game once and changes ratings once", async () => {
    const p1 = await createUser();
    const p2 = await createUser();
    const a = await server.connect(p1.token);
    const b = await server.connect(p2.token);
    const { white, black, swapped } = await startMatch(a, b);
    const whiteUser = swapped ? p2.user : p1.user;
    const blackUser = swapped ? p1.user : p2.user;

    const whiteOvers = record(white, "gameOver");
    const blackOvers = record(black, "gameOver");
    const ratingUpdate = waitFor(black, "ratingUpdate");

    white.emit("resign");
    white.emit("resign");
    black.emit("resign"); // the winner trying to flip the result afterwards
    await ratingUpdate;
    await sleep(300);

    expect(whiteOvers).toHaveLength(1);
    expect(blackOvers).toHaveLength(1);
    expect(blackOvers[0].result).toBe("black");

    const [w, b2] = await Promise.all([
      User.findById(whiteUser._id).lean(),
      User.findById(blackUser._id).lean(),
    ]);
    expect(w.rating).toBe(1180); // K=40, equal ratings
    expect(b2.rating).toBe(1220);
    expect(w.gamesPlayed).toBe(1);
    expect(b2.gamesPlayed).toBe(1);
    expect(b2.gameHistory).toHaveLength(1);

    const record_ = await Game.findOne({ whiteUserId: String(whiteUser._id) }).lean();
    expect(record_).toMatchObject({
      status: "completed",
      result: "black",
      rated: true,
      whiteRatingAfter: 1180,
      blackRatingAfter: 1220,
    });
  });

  test("acceptDraw without a pending offer is ignored", async () => {
    const a = await server.connect(guestToken());
    const b = await server.connect(guestToken());
    const { white, black } = await startMatch(a, b);
    const overs = record(black, "gameOver");

    black.emit("acceptDraw");
    white.emit("acceptDraw");
    await sleep(300);
    expect(overs).toHaveLength(0);

    // Offerer cannot accept their own offer either.
    white.emit("offerDraw");
    await waitFor(black, "drawOffered");
    white.emit("acceptDraw");
    await sleep(200);
    expect(overs).toHaveLength(0);

    black.emit("acceptDraw");
    const over = await waitFor(white, "gameOver");
    expect(over.result).toBe("draw");
  });

  test("moves are rejected after the game is over", async () => {
    const a = await server.connect(guestToken());
    const b = await server.connect(guestToken());
    const { white, black } = await startMatch(a, b);

    black.emit("resign");
    await waitFor(white, "gameOver");

    const error = waitFor(white, "error");
    white.emit("move", { from: "e2", to: "e4" });
    expect((await error).message).toBe("No active game");
  });

  test("moves are rejected during the countdown", async () => {
    const a = await server.connect(guestToken());
    const b = await server.connect(guestToken());
    const errors = [];
    for (const socket of [a, b]) {
      socket.once("playerRole", (role) => {
        if (role === "w") {
          socket.once("error", (e) => errors.push(e.message));
          socket.emit("move", { from: "e2", to: "e4" });
        }
      });
    }
    a.emit("findMatch", { timeControl: "5+0" });
    await sleep(50);
    b.emit("findMatch", { timeControl: "5+0" });
    await Promise.all([waitFor(a, "gameStart"), waitFor(b, "gameStart")]);
    expect(errors).toEqual(["No active game"]);
    a.emit("resign");
  });

  test("malformed move payloads are rejected", async () => {
    const a = await server.connect(guestToken());
    const b = await server.connect(guestToken());
    const { white, black } = await startMatch(a, b);

    const error = waitFor(white, "error");
    white.emit("move", { from: "e2", to: "e4", promotion: "k" });
    expect((await error).message).toBe("Invalid move");
    black.emit("resign");
  });
});

describe("disconnects", () => {
  test("a second tab cannot take over a live game; a real reconnect resumes it", async () => {
    const tokenOfWhite = guestToken();
    const a = await server.connect(tokenOfWhite);
    const b = await server.connect(guestToken());
    const { white, black } = await startMatch(a, b, { aColor: "white" });
    expect(white).toBe(a);

    // Second tab while the first is still connected: no takeover.
    const secondTab = await server.connect(tokenOfWhite, { listen: ["playerRole"] });
    await sleep(300);
    expect(secondTab.recorded.playerRole).toHaveLength(0);
    secondTab.disconnect();

    // Real disconnect + reconnect within the grace period.
    const opponentNotice = waitFor(black, "opponentDisconnected");
    white.disconnect();
    expect((await opponentNotice).color).toBe("White");

    const reconnectNotice = waitFor(black, "opponentReconnected");
    const resumed = await server.connect(tokenOfWhite, {
      listen: ["playerRole", "boardstate"],
    });
    await reconnectNotice;
    expect(resumed.recorded.playerRole).toEqual(["w"]);
    expect(resumed.recorded.boardstate).toHaveLength(1);

    const board = waitFor(black, "boardstate");
    resumed.emit("move", { from: "d2", to: "d4" });
    await board;
    resumed.emit("resign");
  });

  test("a player who never returns loses by abandonment", async () => {
    const a = await server.connect(guestToken());
    const b = await server.connect(guestToken());
    const { white, black } = await startMatch(a, b);

    white.disconnect();
    const over = await waitFor(black, "gameOver", { timeout: 3000 });
    expect(over).toMatchObject({ result: "black", status: "abandoned" });
  });
});

describe("bot games", () => {
  test("are unrated and never block the event loop", async () => {
    const p = await createUser();
    const socket = await server.connect(p.token);
    const histogram = monitorEventLoopDelay({ resolution: 10 });

    const botMove = waitFor(socket, "move", { timeout: 8000 });
    socket.emit("playBot", { difficulty: "hard", colorPreference: "black" });
    await waitFor(socket, "gameStart");
    histogram.enable();
    await botMove; // hard bot opens as white
    histogram.disable();
    expect(histogram.max / 1e6).toBeLessThan(150);

    socket.emit("resign");
    await waitFor(socket, "gameOver");
    await sleep(300);

    const user = await User.findById(p.user._id).lean();
    expect(user.rating).toBe(1200);
    expect(user.gamesPlayed).toBe(0);
    expect(user.gameHistory[0]).toMatchObject({ mode: "bot", rated: false });
  });
});

describe("abuse protection", () => {
  test("chat spam is rate limited", async () => {
    const a = await server.connect(guestToken());
    const b = await server.connect(guestToken());
    const { white, black } = await startMatch(a, b);

    const received = record(black, "chatMessage");
    const limited = waitFor(white, "error", {
      filter: (e) => /Too many requests/.test(e.message),
    });
    for (let i = 0; i < 15; i++) white.emit("chatMessage", { message: `spam ${i}` });
    await limited;
    await sleep(200);
    expect(received.length).toBeLessThanOrEqual(5);
    white.emit("resign");
  });

  test("unauthenticated sockets are refused", async () => {
    await expect(server.connect("not-a-token")).rejects.toThrow("Authentication error");
  });
});
