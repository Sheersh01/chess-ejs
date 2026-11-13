const { createLimiter } = require("../socket/rateLimit");

describe("socket rate limiter", () => {
  test("allows a burst, then blocks, then refills", () => {
    let now = 0;
    const allow = createLimiter({ chat: { capacity: 3, perSecond: 1 } }, () => now);
    expect([allow("chat"), allow("chat"), allow("chat")]).toEqual([true, true, true]);
    expect(allow("chat")).toBe(false);
    now = 1000;
    expect(allow("chat")).toBe(true);
    expect(allow("chat")).toBe(false);
  });

  test("buckets are tracked per event", () => {
    const allow = createLimiter({
      a: { capacity: 1, perSecond: 0 },
      b: { capacity: 1, perSecond: 0 },
    });
    expect(allow("a")).toBe(true);
    expect(allow("a")).toBe(false);
    expect(allow("b")).toBe(true);
  });
});
