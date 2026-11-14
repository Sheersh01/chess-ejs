// In-memory matchmaking queue, one bucket per time control. Kept behind this small
// interface so it could later be backed by a shared store (e.g. a Redis sorted set).

const BASE_RATING_RANGE = 100;
const RANGE_GROWTH_PER_SECOND = 50;
const MAX_RATING_RANGE = 1000;

const ratingRange = (player, now = Date.now()) => {
  const waitedSeconds = Math.max(0, Math.floor((now - player.joinedAt) / 1000));
  return Math.min(
    MAX_RATING_RANGE,
    BASE_RATING_RANGE + RANGE_GROWTH_PER_SECOND * waitedSeconds,
  );
};

const colorsCompatible = (a, b) => {
  const colorA = a.colorPreference || "random";
  const colorB = b.colorPreference || "random";
  return colorA === "random" || colorB === "random" || colorA !== colorB;
};

const isCompatible = (a, b, now = Date.now()) => {
  if (a.socketId === b.socketId || String(a.userId) === String(b.userId)) return false;
  if (a.timeControl !== b.timeControl) return false;
  const diff = Math.abs((a.rating || 0) - (b.rating || 0));
  // Both players' (growing) windows must accept the other.
  return (
    diff <= Math.min(ratingRange(a, now), ratingRange(b, now)) && colorsCompatible(a, b)
  );
};

class MatchmakingQueue {
  constructor() {
    this.buckets = new Map();
  }

  bucket(timeControl) {
    if (!this.buckets.has(timeControl)) this.buckets.set(timeControl, []);
    return this.buckets.get(timeControl);
  }

  add(player) {
    this.bucket(player.timeControl).push(player);
  }

  remove(socketId) {
    for (const list of this.buckets.values()) {
      const index = list.findIndex((player) => player.socketId === socketId);
      if (index !== -1) {
        list.splice(index, 1);
        return true;
      }
    }
    return false;
  }

  hasSocket(socketId) {
    for (const list of this.buckets.values()) {
      if (list.some((player) => player.socketId === socketId)) return true;
    }
    return false;
  }

  hasUser(userId) {
    const key = String(userId);
    for (const list of this.buckets.values()) {
      if (list.some((player) => String(player.userId) === key)) return true;
    }
    return false;
  }

  size() {
    let total = 0;
    for (const list of this.buckets.values()) total += list.length;
    return total;
  }

  /** Remove and return the closest-rated compatible waiting player, if any. */
  takeMatchFor(player, now = Date.now()) {
    const list = this.bucket(player.timeControl);
    let bestIndex = -1;
    let bestDiff = Infinity;
    list.forEach((candidate, index) => {
      if (!isCompatible(player, candidate, now)) return;
      const diff = Math.abs(candidate.rating - player.rating);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIndex = index;
      }
    });
    return bestIndex === -1 ? null : list.splice(bestIndex, 1)[0];
  }

  /**
   * Drop players whose sockets are gone, then pair anyone whose rating windows
   * have widened enough. Returns the pairs (already removed from the queue).
   */
  sweep(isConnected = () => true, now = Date.now()) {
    const pairs = [];
    for (const list of this.buckets.values()) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (!isConnected(list[i].socketId)) list.splice(i, 1);
      }

      // Longest-waiting players first.
      list.sort((a, b) => a.joinedAt - b.joinedAt);
      const paired = new Set();
      for (let i = 0; i < list.length; i++) {
        if (paired.has(i)) continue;
        for (let j = i + 1; j < list.length; j++) {
          if (paired.has(j)) continue;
          if (isCompatible(list[i], list[j], now)) {
            paired.add(i);
            paired.add(j);
            pairs.push([list[i], list[j]]);
            break;
          }
        }
      }
      const remaining = list.filter((_, index) => !paired.has(index));
      list.splice(0, list.length, ...remaining);
    }
    return pairs;
  }

  clear() {
    this.buckets.clear();
  }
}

module.exports = {
  MatchmakingQueue,
  ratingRange,
  isCompatible,
  BASE_RATING_RANGE,
  MAX_RATING_RANGE,
};
