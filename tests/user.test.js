const User = require("../models/User");

describe("User rating updates", () => {
  test("increases rating on win against equal opponent", () => {
    const user = new User({
      username: "tester",
      email: "test@example.com",
      password: "password123",
      rating: 1200,
    });

    user.updateRating(1200, "win");
    expect(user.rating).toBeGreaterThan(1200);
    expect(user.wins).toBe(1);
    expect(user.gamesPlayed).toBe(1);
  });

  test("decreases rating on loss", () => {
    const user = new User({
      username: "tester",
      email: "test@example.com",
      password: "password123",
      rating: 1200,
    });

    user.updateRating(1200, "loss");
    expect(user.rating).toBeLessThan(1200);
    expect(user.losses).toBe(1);
  });

  test("records draw with moderate rating change", () => {
    const user = new User({
      username: "tester",
      email: "test@example.com",
      password: "password123",
      rating: 1200,
    });

    user.updateRating(1200, "draw");
    expect(user.rating).toBe(1200);
    expect(user.draws).toBe(1);
  });
});
