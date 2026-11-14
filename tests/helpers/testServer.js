const { io: ioClient } = require("socket.io-client");
const User = require("../../models/User");
const { start } = require("../../server");
const authService = require("../../services/authService");

const startTestServer = async () => {
  const handle = await start({ port: 0 });
  const url = `http://127.0.0.1:${handle.server.address().port}`;
  const sockets = [];

  // `listen` events are recorded from before the handshake, so nothing the server
  // emits on connection (e.g. a reconnect's playerRole) can be missed.
  const connect = (token, { listen = [] } = {}) =>
    new Promise((resolve, reject) => {
      const socket = ioClient(url, {
        auth: { token },
        transports: ["websocket"],
        forceNew: true,
        reconnection: false,
        autoConnect: false,
      });
      socket.recorded = {};
      for (const event of listen) socket.recorded[event] = record(socket, event);
      sockets.push(socket);
      socket.connect();
      socket.once("connect", () => resolve(socket));
      socket.once("connect_error", reject);
    });

  const close = async () => {
    for (const socket of sockets) socket.disconnect();
    await handle.stop("Test server stopping");
  };

  return { ...handle, url, connect, close };
};

const guestToken = () => authService.createGuestSession().token;

let userCounter = 0;
const createUser = async (overrides = {}) => {
  userCounter++;
  const suffix = `${Date.now().toString(36)}${userCounter}`;
  const user = await User.create({
    username: `t_${suffix}`.slice(0, 20),
    email: `t_${suffix}@example.info`,
    password: "password123",
    ...overrides,
  });
  return { user, token: authService.signToken(user) };
};

const waitFor = (socket, event, { timeout = 4000, filter = () => true } = {}) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for "${event}"`));
    }, timeout);
    const handler = (payload) => {
      if (!filter(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });

/** Collect every payload of `event` on `socket` until stopped. */
const record = (socket, event) => {
  const items = [];
  socket.on(event, (payload) => items.push(payload));
  return items;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Matchmake two sockets and resolve once both games have started. */
const startMatch = async (a, b, { aColor = "random", timeControl = "10+0" } = {}) => {
  const roleA = waitFor(a, "playerRole");
  const roleB = waitFor(b, "playerRole");
  const startA = waitFor(a, "gameStart");
  const startB = waitFor(b, "gameStart");
  a.emit("findMatch", { timeControl, colorPreference: aColor });
  await sleep(50);
  b.emit("findMatch", { timeControl });
  const [colorA] = await Promise.all([roleA, roleB]);
  await Promise.all([startA, startB]);
  return colorA === "w"
    ? { white: a, black: b }
    : { white: b, black: a, swapped: true };
};

module.exports = {
  startTestServer,
  guestToken,
  createUser,
  waitFor,
  record,
  sleep,
  startMatch,
};
