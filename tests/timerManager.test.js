const { Chess } = require("chess.js");
const timerManager = require("../game/timerManager");
const { getTimeControl, normalizeTimeControl } = require("../game/timeControls");

const START = 1000000;

const fakeIo = () => {
  const emitted = [];
  return {
    emitted,
    to: () => ({ emit: (event, payload) => emitted.push([event, payload]) }),
  };
};

const makeGame = (timeControl) => ({
  id: "g1",
  chess: new Chess(),
  clock: timerManager.createClock(timeControl),
});

describe("time controls", () => {
  test("unknown values fall back to 10+0", () => {
    expect(normalizeTimeControl("99+99")).toBe("10+0");
    expect(normalizeTimeControl(undefined)).toBe("10+0");
    expect(getTimeControl("3+2")).toMatchObject({
      initialMs: 180000,
      incrementMs: 2000,
    });
  });
});

describe("timerManager", () => {
  beforeEach(() => jest.useFakeTimers({ now: START }));
  afterEach(() => jest.useRealTimers());

  test("charges the mover and adds increment on switchTurn", () => {
    const io = fakeIo();
    const game = makeGame("3+2");
    timerManager.start(game, io, jest.fn());

    jest.advanceTimersByTime(5000);
    game.chess.move("e4");
    timerManager.switchTurn(game, io, "white");

    expect(game.clock.remainingMs.white).toBe(180000 - 5000 + 2000);
    expect(game.clock.activeColor).toBe("black");
    timerManager.stop(game);
  });

  test("fires onFlag exactly when the active side runs out", () => {
    const game = makeGame("1+0");
    const onFlag = jest.fn();
    timerManager.start(game, fakeIo(), onFlag);

    jest.advanceTimersByTime(59999);
    expect(onFlag).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(onFlag).toHaveBeenCalledWith(game, "white");
    expect(game.clock.running).toBe(false);
  });

  test("emits a single low-time warning at 10 seconds", () => {
    const io = fakeIo();
    const game = makeGame("1+0");
    timerManager.start(game, io, jest.fn());

    jest.advanceTimersByTime(55000);
    const lowTime = io.emitted.filter(([event]) => event === "lowTime");
    expect(lowTime).toEqual([["lowTime", { color: "white" }]]);
    timerManager.stop(game);
  });

  test("hasFlagged detects an expired clock before the timer fires", () => {
    const game = makeGame("1+0");
    timerManager.start(game, fakeIo(), jest.fn());
    jest.setSystemTime(START + 61000); // wall clock moved, timers not yet run
    expect(timerManager.hasFlagged(game)).toBe(true);
    timerManager.stop(game);
  });

  test("timerUpdate payload carries ms precision and the running side", () => {
    const game = makeGame("5+0");
    timerManager.start(game, fakeIo(), jest.fn());
    jest.advanceTimersByTime(1500);
    const payload = timerManager.buildPayload(game);
    expect(payload).toMatchObject({
      whiteMs: 298500,
      blackMs: 300000,
      active: "white",
    });
    expect(payload.white).toBe(299);
    timerManager.stop(game);
  });
});
