import { el } from "../core/dom.js";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let titleCounter = 0;

/**
 * Accessible modal dialog with focus trap and Escape handling.
 * actions: [{ label, value, variant: "primary"|"danger"|"ghost"|..., autofocus }]
 * Returns { result: Promise<value|null>, close(value), body, dialog }.
 */
export const openModal = ({
  title,
  body = null,
  actions = [],
  dismissible = true,
  className = "",
}) => {
  const previouslyFocused = document.activeElement;
  const titleId = `modal-title-${++titleCounter}`;

  const bodyNode =
    body instanceof Node ? body : el("p", { class: "modal-text", text: body || "" });
  const actionRow = el("div", { class: "modal-actions" });
  const dialog = el(
    "div",
    {
      class: `modal ${className}`.trim(),
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": titleId,
    },
    [el("h2", { id: titleId, class: "modal-title", text: title }), bodyNode, actionRow],
  );
  const backdrop = el("div", { class: "modal-backdrop" }, [dialog]);

  let settle;
  const result = new Promise((resolve) => {
    settle = resolve;
  });

  let closed = false;
  const close = (value = null) => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKeydown, true);
    backdrop.classList.remove("is-visible");
    setTimeout(() => backdrop.remove(), 180);
    if (previouslyFocused && typeof previouslyFocused.focus === "function") {
      previouslyFocused.focus();
    }
    settle(value);
  };

  const onKeydown = (event) => {
    if (event.key === "Escape" && dismissible) {
      event.preventDefault();
      close(null);
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialog.querySelectorAll(FOCUSABLE));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  let autofocusTarget = null;
  for (const action of actions) {
    const button = el("button", {
      type: "button",
      class: `btn btn-${action.variant || "ghost"}`,
      text: action.label,
      onClick: () => close(action.value),
    });
    if (action.autofocus) autofocusTarget = button;
    actionRow.append(button);
  }

  if (dismissible) {
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) close(null);
    });
  }

  document.addEventListener("keydown", onKeydown, true);
  document.body.append(backdrop);
  requestAnimationFrame(() => backdrop.classList.add("is-visible"));
  (autofocusTarget || dialog.querySelector(FOCUSABLE) || dialog).focus?.();

  return { result, close, body: bodyNode, dialog };
};

/** Yes/no confirmation. Resolves true only when confirmed. */
export const confirmDialog = async ({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "primary",
}) => {
  const { result } = openModal({
    title,
    body: message,
    actions: [
      { label: cancelLabel, value: false, variant: "ghost" },
      { label: confirmLabel, value: true, variant, autofocus: true },
    ],
  });
  return (await result) === true;
};
