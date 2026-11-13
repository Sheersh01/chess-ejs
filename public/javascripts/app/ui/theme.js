import { load, save } from "../core/storage.js";

// "system" follows the OS; "dark" / "light" force a theme.
const media = window.matchMedia("(prefers-color-scheme: light)");

const resolve = (preference) =>
  preference === "system" ? (media.matches ? "light" : "dark") : preference;

export const getThemePreference = () => load("theme", "dark");

export const applyTheme = (preference = getThemePreference()) => {
  document.documentElement.dataset.theme = resolve(preference);
};

export const setThemePreference = (preference) => {
  save("theme", preference);
  applyTheme(preference);
};

media.addEventListener?.("change", () => {
  if (getThemePreference() === "system") applyTheme("system");
});
