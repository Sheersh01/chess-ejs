const socketIO = require("socket.io");

module.exports = function (server) {
  const io = socketIO(server);

  require("./auth.socket")(io);
  require("./matchmaking.socket")(io);
  require("./game.socket")(io);

  return io;
};
