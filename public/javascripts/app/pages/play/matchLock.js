import { $$ } from "../../core/dom.js";
import { toast } from "../../ui/toast.js";

const MESSAGE =
  "Finish the current match first. Leaving is disabled while a game is active.";
let locked = false;
let pushedState = false;

const isGuardedHref = (href = "") =>
  href === "/" ||
  ["/profile", "/leaderboard", "/games"].some((path) => href.startsWith(path));

const warn = () => toast(MESSAGE, { type: "warning", id: "match-lock" });

/** While a game is live, block in-app navigation, logout, back and tab close. */
export const setMatchLock = (value) => {
  locked = Boolean(value);
  for (const node of $$(".topbar-actions .nav-btn")) {
    node.classList.toggle("nav-btn-disabled", locked);
    if (locked) {
      node.setAttribute("aria-disabled", "true");
      node.setAttribute("title", "Finish the current match to use this");
    } else {
      node.removeAttribute("aria-disabled");
      node.removeAttribute("title");
    }
  }
  if (locked && !pushedState) {
    window.history.pushState({ matchLock: true }, "", window.location.href);
    pushedState = true;
  }
  if (!locked) pushedState = false;
};

export const initMatchLock = () => {
  document.addEventListener("click", (event) => {
    const anchor = event.target.closest("a[href]");
    if (locked && anchor && isGuardedHref(anchor.getAttribute("href"))) {
      event.preventDefault();
      warn();
    }
  });

  document.addEventListener("submit", (event) => {
    if (
      locked &&
      (event.target.getAttribute("action") || "").startsWith("/auth/logout")
    ) {
      event.preventDefault();
      warn();
    }
  });

  window.addEventListener("beforeunload", (event) => {
    if (!locked) return;
    event.preventDefault();
    event.returnValue = "";
  });

  window.addEventListener("popstate", () => {
    if (!locked) return;
    window.history.pushState({ matchLock: true }, "", window.location.href);
    warn();
  });

  // Redirected here by the server after a blocked logout.
  const params = new URLSearchParams(window.location.search);
  if (params.has("matchExitBlocked")) {
    warn();
    params.delete("matchExitBlocked");
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );
  }
};
