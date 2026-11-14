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
  window.scrollTo({ top: 0 });
};

// Lobby form fields (radio groups and a select), remembered between visits.
const FIELDS = ["timeControl", "colorPreference", "difficulty", "personality"];
const COLOR_LABELS = { random: "Random", white: "White", black: "Black" };

const form = () => $("#lobby-form");

export const readSettings = () =>
  Object.fromEntries(FIELDS.map((name) => [name, form()?.elements[name]?.value]));

export const initLobbySettings = () => {
  const lobbyForm = form();
  if (!lobbyForm) return;

  const saved = load("lobby", {});
  for (const name of FIELDS) {
    const field = lobbyForm.elements[name];
    if (!field || !saved[name]) continue;
    // Only restore values that still exist as options.
    const options = field instanceof RadioNodeList ? [...field] : [...field.options];
    if (options.some((option) => option.value === saved[name]))
      field.value = saved[name];
  }

  lobbyForm.addEventListener("change", () => save("lobby", readSettings()));
  lobbyForm.addEventListener("submit", (event) => event.preventDefault());
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
  subtitle.textContent = `${settings.timeControl} · playing ${color.toLowerCase()}`;
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
    const games = `${data.activeGames} game${data.activeGames === 1 ? "" : "s"} in progress`;
    const players = `${data.activePlayers} player${data.activePlayers === 1 ? "" : "s"} playing`;
    node.textContent = `${games} · ${players}`;
  } catch {
    node.textContent = "Live stats unavailable";
  }
};
