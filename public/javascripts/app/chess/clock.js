const LOW_TIME_MS = 20000;

export const formatClock = (ms) => {
  const safe = Math.max(0, ms);
  if (safe < 10000) {
    // Tenths under ten seconds, where they matter.
    const tenths = Math.floor(safe / 100);
    return `0:0${Math.floor(tenths / 10)}.${tenths % 10}`;
  }
  const totalSeconds = Math.ceil(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

/**
 * Displays server clocks. The server sends {whiteMs, blackMs, active, serverTs};
 * the running side is counted down locally between updates.
 */
export class Clock {
  constructor({ white, black }) {
    this.nodes = { white, black };
    this.state = { whiteMs: 0, blackMs: 0, active: null, syncedAt: 0 };
    this.frame = null;
  }

  update(payload) {
    this.state = {
      whiteMs: payload.whiteMs ?? payload.white * 1000,
      blackMs: payload.blackMs ?? payload.black * 1000,
      active: payload.active ?? null,
      syncedAt: performance.now(),
    };
    this.render();
    if (this.state.active) this.start();
    else this.stop();
  }

  remaining(color) {
    const base = this.state[`${color}Ms`];
    if (this.state.active !== color) return base;
    return Math.max(0, base - (performance.now() - this.state.syncedAt));
  }

  render() {
    for (const color of ["white", "black"]) {
      const node = this.nodes[color];
      if (!node) continue;
      const ms = this.remaining(color);
      const text = formatClock(ms);
      if (node.textContent !== text) node.textContent = text;
      node.classList.toggle("is-running", this.state.active === color);
      node.classList.toggle("is-low", ms <= LOW_TIME_MS);
      node.classList.toggle("is-flagged", ms <= 0);
    }
  }

  start() {
    if (this.frame) return;
    const tick = () => {
      this.render();
      this.frame = this.state.active ? requestAnimationFrame(tick) : null;
    };
    this.frame = requestAnimationFrame(tick);
  }

  stop() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.render();
  }

  reset(ms) {
    this.update({ whiteMs: ms, blackMs: ms, active: null });
  }
}
