const stats = {
  totalGames: 0,
  completedGames: 0,
  whiteWins: 0,
  blackWins: 0,
  draws: 0,
  resignations: 0,
  timeouts: 0,
  checkmates: 0,
};

module.exports = {
  stats,
  getStats: (activeGames = 0, activePlayers = 0) => ({
    ...stats,
    activeGames,
    activePlayers,
  }),
};
