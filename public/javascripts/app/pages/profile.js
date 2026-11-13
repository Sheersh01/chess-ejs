// Profile page behaviour (kept out of the HTML so the CSP can forbid inline scripts).
import { initShell } from "../ui/shell.js";
import { confirmDialog } from "../ui/modal.js";

initShell();

const syncColor = (colorId, textId) => {
  const colorInput = document.getElementById(colorId);
  const textInput = document.getElementById(textId);
  if (!colorInput || !textInput) {
    return;
  }

  const applyPreview = () => {
    const light = document.getElementById("boardLight")?.value;
    const dark = document.getElementById("boardDark")?.value;
    if (!light || !dark) {
      return;
    }
    const squares = document.querySelectorAll(".preview-square");
    squares.forEach((square, index) => {
      const row = Math.floor(index / 4);
      const col = index % 4;
      square.style.background = (row + col) % 2 === 0 ? light : dark;
    });
  };

  colorInput.addEventListener("input", () => {
    textInput.value = colorInput.value;
    applyPreview();
  });

  textInput.addEventListener("change", () => {
    if (/^#[0-9A-Fa-f]{6}$/.test(textInput.value)) {
      colorInput.value = textInput.value;
      applyPreview();
    } else {
      textInput.value = colorInput.value;
    }
  });

  applyPreview();
};

syncColor("boardLight", "boardLightText");
syncColor("boardDark", "boardDarkText");
syncColor("hintColor", "hintColorText");

const profileSettingsForm = document.getElementById("profile-settings-form");
const saveSettingsButton = document.getElementById("save-settings-button");

if (profileSettingsForm && saveSettingsButton) {
  const trackedFields = ["displayName", "boardLight", "boardDark", "hintColor"]
    .map((name) => profileSettingsForm.elements.namedItem(name))
    .filter(Boolean);

  const snapshot = new Map(trackedFields.map((field) => [field.name, field.value]));

  const updateSaveButtonState = () => {
    const hasChanges = trackedFields.some(
      (field) => field.value !== snapshot.get(field.name),
    );
    saveSettingsButton.disabled = !hasChanges;
  };

  trackedFields.forEach((field) => {
    field.addEventListener("input", updateSaveButtonState);
    field.addEventListener("change", updateSaveButtonState);
  });

  updateSaveButtonState();
}

const deleteAccountForm = document.getElementById("delete-account-form");
let deleteConfirmed = false;
deleteAccountForm?.addEventListener("submit", async (event) => {
  if (deleteConfirmed) return;
  event.preventDefault();
  const confirmed = await confirmDialog({
    title: "Delete your account?",
    message:
      "Your profile, rating and game history will be permanently deleted. This cannot be undone.",
    confirmLabel: "Delete account",
    variant: "danger",
  });
  if (confirmed) {
    deleteConfirmed = true;
    deleteAccountForm.requestSubmit();
  }
});
