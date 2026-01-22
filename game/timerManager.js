const { stats } = require("../stats/gameStats");

const startTimer = (game, io) => {
  if (game.timerInterval) clearInterval(game.timerInterval);

  game.timerInterval = setInterval(() => {
    const color = game.chess.turn() === "w" ? "white" : "black";
    game.timers[color]--;

    io.to(game.id).emit("timerUpdate", game.timers);

    // Play warning sound when time is low (10 seconds or less)
    if (game.timers[color] === 10) {
      io.to(game.id).emit("lowTime", { color });
    }

    if (game.timers[color] <= 0) {
      clearInterval(game.timerInterval);
      stats.timeouts++;
      stats.completedGames++;

      const winner = color === "white" ? "black" : "white";
      io.to(game.id).emit("timeOut", {
        winner,
        message: `${color === "white" ? "White" : "Black"} ran out of time!`,
      });

      // Clean up the game
      const gameManager = require("./gameManager");
      gameManager.cleanupGame(game.id);
    }
  }, 1000);
};

const stopTimer = (game) => {
  if (game.timerInterval) {
    clearInterval(game.timerInterval);
    game.timerInterval = null;
  }
};

module.exports = {
  startTimer,
  stopTimer,
};
