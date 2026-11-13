const { parentPort } = require("worker_threads");
const { getBotMove } = require("./search");

parentPort.on("message", ({ id, fen, options }) => {
  try {
    parentPort.postMessage({ id, move: getBotMove(fen, options) });
  } catch (error) {
    parentPort.postMessage({ id, error: error.message });
  }
});
