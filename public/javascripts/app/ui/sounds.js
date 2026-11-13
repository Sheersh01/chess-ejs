import { load, save } from "../core/storage.js";

const FILES = {
  moveSelf: "move-self",
  moveOpponent: "move-opponent",
  capture: "capture",
  check: "move-check",
  castle: "castle",
  promote: "promote",
  premove: "premove",
  gameStart: "game-start",
  gameEnd: "game-end",
  notify: "notify",
  illegal: "illegal",
  tenseconds: "tenseconds",
};

const DEBOUNCE_MS = 120;
let settings = load("sound", { enabled: true, volume: 0.5 });
let cache = null;
let lastPlayedAt = 0;

const getCache = () => {
  if (!cache) {
    cache = Object.fromEntries(
      Object.entries(FILES).map(([key, file]) => [
        key,
        new Audio(`/sounds/${file}.mp3`),
      ]),
    );
  }
  return cache;
};

export const getSoundSettings = () => ({ ...settings });

export const setSoundSettings = (next) => {
  settings = { ...settings, ...next };
  settings.volume = Math.min(1, Math.max(0, Number(settings.volume) || 0));
  save("sound", settings);
};

export const playSound = (type) => {
  if (!settings.enabled || settings.volume === 0) return;
  const now = Date.now();
  if (now - lastPlayedAt < DEBOUNCE_MS) return;
  lastPlayedAt = now;

  const audio = getCache()[type];
  if (!audio) return;
  audio.volume = settings.volume;
  audio.currentTime = 0;
  audio.play().catch(() => {
    // Autoplay can be blocked until the user interacts; ignore.
  });
};

/** Pick the sound for a chess.js verbose move. */
export const soundForMove = (move, isOwnMove) => {
  if (move.flags?.includes("p")) return "promote";
  if (move.flags?.includes("k") || move.flags?.includes("q")) return "castle";
  if (move.san?.includes("+") || move.san?.includes("#")) return "check";
  if (move.captured) return "capture";
  return isOwnMove ? "moveSelf" : "moveOpponent";
};
