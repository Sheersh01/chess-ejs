import { el } from "../core/dom.js";

const MAX_TOASTS = 3;
let region = null;

const getRegion = () => {
  if (!region) {
    region = el("div", {
      class: "toast-region",
      role: "status",
      "aria-live": "polite",
    });
    document.body.append(region);
  }
  return region;
};

/**
 * Show a toast. Types: info | success | warning | error.
 * `persistent` toasts stay until dismissed; `id` replaces an existing toast.
 */
export const toast = (
  message,
  { type = "info", duration = 3200, persistent = false, id = null } = {},
) => {
  const container = getRegion();
  if (id) container.querySelector(`[data-toast-id="${id}"]`)?.remove();

  const node = el(
    "div",
    { class: `toast toast-${type}`, dataset: id ? { toastId: id } : {} },
    [el("span", { class: "toast-message", text: message })],
  );

  const dismiss = () => {
    node.classList.remove("is-visible");
    setTimeout(() => node.remove(), 250);
  };

  if (persistent) {
    node.append(
      el("button", {
        class: "toast-close",
        type: "button",
        "aria-label": "Dismiss notification",
        text: "×",
        onClick: dismiss,
      }),
    );
  } else {
    setTimeout(dismiss, duration);
  }

  container.append(node);
  while (container.children.length > MAX_TOASTS) container.firstElementChild.remove();
  requestAnimationFrame(() => node.classList.add("is-visible"));
  return { dismiss };
};

export const dismissToast = (id) => {
  region?.querySelector(`[data-toast-id="${id}"]`)?.remove();
};
