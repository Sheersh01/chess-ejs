import { $, show } from "../../core/dom.js";
import { initShell } from "../../ui/shell.js";
import { toast, dismissToast } from "../../ui/toast.js";
import { initMatchLock, setMatchLock } from "./matchLock.js";
import {
  initLobbySettings,
  loadLobbyStats,
  readSettings,
  showScreen,
  showSearching,
  stopSearchTimer,
} from "./lobby.js";
import { GameController } from "./game.js";

let socket = null;
let lastMode = "online";

const backToLobby = (message, type = "info") => {
  stopSearchTimer();
  setMatchLock(false);
  showScreen("landing-screen");
  loadLobbyStats();
  if (message) toast(message, { type });
};

const requestMatch = (mode) => {
  lastMode = mode;
  const settings = readSettings();
  showSearching(mode, settings);
  if (mode === "bot") {
    socket.emit("playBot", {
      colorPreference: settings.colorPreference,
      timeControl: settings.timeControl,
      difficulty: settings.difficulty,
      personality: settings.personality,
    });
  } else {
    socket.emit("findMatch", {
      colorPreference: settings.colorPreference,
      timeControl: settings.timeControl,
    });
  }
};

const connect = (game) => {
  // Connect on page load so a refreshed tab resumes its running game.
  socket = window.io({ withCredentials: true });
  game.bind(socket);

  socket.on("matchmakingBlocked", ({ message }) => backToLobby(message, "warning"));
  socket.on("matchmakingCancelled", () => backToLobby("Search cancelled."));
  socket.on("error", (payload) => {
    if (payload?.message) toast(payload.message, { type: "warning" });
  });

  socket.on("connect_error", (error) => {
    if (error?.message === "Authentication error") {
      window.location.assign("/auth/login");
    }
  });

  const banner = $("#connection-banner");
  socket.on("disconnect", (reason) => {
    if (reason !== "io client disconnect") show(banner, true);
  });
  socket.io.on("reconnect", () => {
    show(banner, false);
    dismissToast("connection");
    toast("Reconnected.", { type: "success", id: "connection" });
  });
};

const init = () => {
  initShell();
  initMatchLock();
  initLobbySettings();
  loadLobbyStats();

  const game = new GameController({
    getSocket: () => socket,
    onPlayAgain: () => requestMatch(lastMode),
  });
  connect(game);

  $("#play-online-button")?.addEventListener("click", () => requestMatch("online"));
  $("#play-bot-button")?.addEventListener("click", () => requestMatch("bot"));
  $("#rematch-button")?.addEventListener("click", () => requestMatch(lastMode));
  $("#lobby-button")?.addEventListener("click", () => backToLobby());
  $("#cancel-matchmaking-button")?.addEventListener("click", () => {
    socket.emit("cancelMatchmaking");
  });
};

init();
