// Per-socket, per-event token buckets. `capacity` = burst size,
// `perSecond` = sustained refill rate.
const LIMITS = {
  move: { capacity: 10, perSecond: 10 },
  chatMessage: { capacity: 5, perSecond: 0.5 },
  findMatch: { capacity: 5, perSecond: 0.5 },
  playBot: { capacity: 5, perSecond: 0.5 },
  cancelMatchmaking: { capacity: 5, perSecond: 0.5 },
  offerDraw: { capacity: 3, perSecond: 0.3 },
  acceptDraw: { capacity: 3, perSecond: 0.3 },
  declineDraw: { capacity: 3, perSecond: 0.3 },
  withdrawDraw: { capacity: 3, perSecond: 0.3 },
  resign: { capacity: 3, perSecond: 0.3 },
};
const DEFAULT_LIMIT = { capacity: 20, perSecond: 5 };

const createLimiter = (limits = LIMITS, now = () => Date.now()) => {
  const buckets = new Map();
  return (event) => {
    const { capacity, perSecond } = limits[event] || DEFAULT_LIMIT;
    const time = now();
    const bucket = buckets.get(event) || { tokens: capacity, updatedAt: time };
    bucket.tokens = Math.min(
      capacity,
      bucket.tokens + ((time - bucket.updatedAt) / 1000) * perSecond,
    );
    bucket.updatedAt = time;
    buckets.set(event, bucket);

    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  };
};

/** Install on every socket: over-limit events are dropped with an error notice. */
const attachRateLimit = (socket, limits = LIMITS) => {
  const allow = createLimiter(limits);
  socket.use(([event], next) => {
    if (allow(event)) return next();
    socket.emit("error", { message: "Too many requests, slow down." });
  });
};

module.exports = { LIMITS, createLimiter, attachRateLimit };
