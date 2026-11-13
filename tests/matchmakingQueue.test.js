const { MatchmakingQueue, ratingRange } = require("../game/matchmakingQueue");

const player = (id, rating, extra = {}) => ({
  socketId: `s${id}`,
  userId: `u${id}`,
  username: `p${id}`,
  rating,
  colorPreference: "random",
  timeControl: "10+0",
  joinedAt: 0,
  ...extra,
});

describe("MatchmakingQueue", () => {
  test("rating window widens with waiting time, up to a cap", () => {
    const p = player(1, 1200);
    expect(ratingRange(p, 0)).toBe(100);
    expect(ratingRange(p, 4000)).toBe(300);
    expect(ratingRange(p, 600000)).toBe(1000);
  });

  test("picks the closest compatible rating", () => {
    const queue = new MatchmakingQueue();
    queue.add(player(1, 1290));
    queue.add(player(2, 1210));
    expect(queue.takeMatchFor(player(3, 1200), 0).userId).toBe("u2");
    expect(queue.size()).toBe(1);
  });

  test("never matches across time controls or with the same user", () => {
    const queue = new MatchmakingQueue();
    queue.add(player(1, 1200, { timeControl: "3+0" }));
    queue.add(player(2, 1200, { socketId: "other-tab" }));
    expect(queue.takeMatchFor(player(2, 1200), 0)).toBeNull();
  });

  test("sweep pairs players once their windows overlap", () => {
    const queue = new MatchmakingQueue();
    queue.add(player(1, 1000));
    queue.add(player(2, 1400));
    expect(queue.sweep(() => true, 1000)).toHaveLength(0);
    expect(queue.sweep(() => true, 6000)).toHaveLength(1); // window is 400 after 6s
    expect(queue.size()).toBe(0);
  });

  test("sweep drops disconnected players", () => {
    const queue = new MatchmakingQueue();
    queue.add(player(1, 1200));
    queue.sweep((socketId) => socketId !== "s1", 0);
    expect(queue.size()).toBe(0);
  });

  test("conflicting color preferences are not matched", () => {
    const queue = new MatchmakingQueue();
    queue.add(player(1, 1200, { colorPreference: "w" }));
    expect(queue.takeMatchFor(player(2, 1200, { colorPreference: "w" }), 0)).toBeNull();
    expect(
      queue.takeMatchFor(player(3, 1200, { colorPreference: "b" }), 0),
    ).not.toBeNull();
  });
});
