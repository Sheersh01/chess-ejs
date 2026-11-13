const os = require("os");
const path = require("path");
const { Worker } = require("worker_threads");
const logger = require("../../config/logger");

const WORKER_PATH = path.join(__dirname, "worker.js");
const DEFAULT_SIZE = Math.max(1, Math.min(2, os.cpus().length - 1));

/**
 * Small fixed-size worker_threads pool so bot search never blocks the event loop.
 * Jobs that exceed their timeout resolve with `null` and the stuck worker is replaced.
 */
class BotWorkerPool {
  constructor(size = DEFAULT_SIZE) {
    this.size = size;
    this.slots = [];
    this.queue = [];
    this.nextId = 1;
    this.closed = false;
  }

  spawn(slot) {
    const worker = new Worker(WORKER_PATH);
    worker.unref();
    slot.worker = worker;
    slot.job = null;

    worker.on("message", (message) => {
      const job = slot.job;
      if (!job || job.id !== message.id) return;
      this.finish(slot, message.error ? null : message.move, message.error);
    });

    worker.on("error", (error) => {
      logger.error({ err: error }, "Bot worker crashed");
    });

    worker.on("exit", () => {
      if (slot.worker !== worker) return;
      slot.worker = null;
      if (slot.job) this.finish(slot, null, "worker exited");
      if (!this.closed) {
        this.spawn(slot);
        this.drain();
      }
    });
  }

  ensureStarted() {
    if (this.slots.length > 0 || this.closed) return;
    for (let i = 0; i < this.size; i++) {
      const slot = { worker: null, job: null };
      this.slots.push(slot);
      this.spawn(slot);
    }
  }

  finish(slot, move, error) {
    const job = slot.job;
    slot.job = null;
    if (job) {
      clearTimeout(job.timer);
      if (error) logger.warn({ error }, "Bot search failed");
      job.resolve(move || null);
    }
    this.drain();
  }

  drain() {
    for (const slot of this.slots) {
      if (this.queue.length === 0) return;
      if (!slot.worker || slot.job) continue;

      const job = this.queue.shift();
      slot.job = job;
      job.timer = setTimeout(() => {
        // Stuck search: detach and replace the worker, then give up on the job.
        const stuck = slot.worker;
        slot.worker = null;
        stuck?.terminate();
        this.finish(slot, null, "bot search timed out");
        if (!this.closed) {
          this.spawn(slot);
          this.drain();
        }
      }, job.timeoutMs);
      job.timer.unref?.();
      slot.worker.postMessage({ id: job.id, fen: job.fen, options: job.options });
    }
  }

  run(fen, options, timeoutMs) {
    if (this.closed) return Promise.resolve(null);
    this.ensureStarted();
    return new Promise((resolve) => {
      this.queue.push({
        id: this.nextId++,
        fen,
        options,
        timeoutMs,
        resolve,
        timer: null,
      });
      this.drain();
    });
  }

  async terminate() {
    this.closed = true;
    for (const job of this.queue.splice(0)) job.resolve(null);
    await Promise.all(
      this.slots.map(async (slot) => {
        if (slot.job) this.finish(slot, null);
        const worker = slot.worker;
        slot.worker = null;
        if (worker) await worker.terminate();
      }),
    );
    this.slots = [];
  }
}

module.exports = new BotWorkerPool();
module.exports.BotWorkerPool = BotWorkerPool;
