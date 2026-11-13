import { $, el } from "../core/dom.js";
import { openModal } from "./modal.js";
import { applyTheme, getThemePreference, setThemePreference } from "./theme.js";
import { getSoundSettings, playSound, setSoundSettings } from "./sounds.js";

const buildSettingsBody = () => {
  const sound = getSoundSettings();
  const themeSelect = el("select", { id: "settings-theme", class: "field-select" }, [
    el("option", { value: "dark", text: "Dark" }),
    el("option", { value: "light", text: "Light" }),
    el("option", { value: "system", text: "Match system" }),
  ]);
  themeSelect.value = getThemePreference();
  themeSelect.addEventListener("change", () => setThemePreference(themeSelect.value));

  const soundToggle = el("input", {
    id: "settings-sound",
    type: "checkbox",
    class: "toggle-input",
  });
  soundToggle.checked = sound.enabled;

  const volume = el("input", {
    id: "settings-volume",
    type: "range",
    min: "0",
    max: "100",
    step: "5",
    class: "range-input",
  });
  volume.value = String(Math.round(sound.volume * 100));
  volume.disabled = !sound.enabled;

  soundToggle.addEventListener("change", () => {
    setSoundSettings({ enabled: soundToggle.checked });
    volume.disabled = !soundToggle.checked;
  });
  volume.addEventListener("input", () =>
    setSoundSettings({ volume: volume.value / 100 }),
  );
  volume.addEventListener("change", () => playSound("moveSelf"));

  return el("div", { class: "settings-body" }, [
    el("div", { class: "field-group" }, [
      el("label", { class: "field-label", for: "settings-theme", text: "Theme" }),
      themeSelect,
    ]),
    el("div", { class: "settings-row" }, [
      el("label", {
        class: "field-label",
        for: "settings-sound",
        text: "Sound effects",
      }),
      soundToggle,
    ]),
    el("div", { class: "field-group" }, [
      el("label", { class: "field-label", for: "settings-volume", text: "Volume" }),
      volume,
    ]),
  ]);
};

export const openSettings = () =>
  openModal({
    title: "Settings",
    body: buildSettingsBody(),
    actions: [{ label: "Done", value: true, variant: "primary" }],
    className: "modal-settings",
  });

/** Shared behaviour for every page with the top bar. */
export const initShell = () => {
  applyTheme();
  $("#settings-button")?.addEventListener("click", () => openSettings());
};
