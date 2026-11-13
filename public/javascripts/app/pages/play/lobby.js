import { $, show } from "../../core/dom.js";
import { load, save } from "../../core/storage.js";

const SCREENS = [
  "landing-screen",
  "finding-match-screen",
  "countdown-screen",
  "game-area",
];

export const showScreen = (id) => {
  for (const screen of SCREENS) show($(`#${screen}`), screen === id);
};

const FIELDS = {
  colorPreference: "#color-preference-select",
  timeControl: "#time-control-select",
  difficulty: "#bot-difficulty-select",
  personality: "#bot-personality-select",
};

const COLOR_LABELS = { random: "Random", white: "White", black: "Black" };

/** Lobby form, remembered between visits. */
export const readSettings = () =>
  Object.fromEntries(
    Object.entries(FIELDS).map(([key, selector]) => [key, $(selector)?.value]),
  );

export const initLobbySettings = () => {
  const saved = load("lobby", {});
  for (const [key, selector] of Object.entries(FIELDS)) {
    const select = $(selector);
    if (!select) continue;
    if (
      saved[key] &&
      [...select.options].some((option) => option.value === saved[key])
    ) {
      select.value = saved[key];
    }
    select.addEventListener("change", () => save("lobby", readSettings()));
  }
};

let searchTimer = null;

export const stopSearchTimer = () => {
  clearInterval(searchTimer);
  searchTimer = null;
};

export const showSearching = (mode, settings) => {
  showScreen("finding-match-screen");
  stopSearchTimer();
  const title = $("#finding-match-text");
  const subtitle = $("#finding-match-subtext");
  const status = $("#finding-match-status");
  show($("#cancel-matchmaking-button"), mode === "online");

  const color = COLOR_LABELS[settings.colorPreference] || "Random";
  if (mode === "bot") {
    title.textContent = "Setting up your bot game…";
    subtitle.textContent = `${settings.timeControl} · ${settings.difficulty} · ${settings.personality} · ${color}`;
    status.textContent = "The game starts after a short countdown.";
    return;
  }

  title.textContent = "Finding an opponent…";
  subtitle.textContent = `${settings.timeControl} · preferred color: ${color}`;
  const startedAt = Date.now();
  const tick = () => {
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    const range = Math.min(1000, 100 + 50 * seconds);
    status.textContent = `Searching for ${seconds}s · rating range ±${range}`;
  };
  tick();
  searchTimer = setInterval(tick, 1000);
};

export const loadLobbyStats = async () => {
  const node = $("#lobby-stats");
  if (!node) return;
  try {
    const response = await fetch("/api/v1/stats", { credentials: "same-origin" });
    const { data } = await response.json();
    node.textContent = `${data.activeGames} live game${data.activeGames === 1 ? "" : "s"} · ${data.activePlayers} player${data.activePlayers === 1 ? "" : "s"} in a match`;
  } catch {
    node.textContent = "Live stats unavailable";
  }
};
