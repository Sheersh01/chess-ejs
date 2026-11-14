// Runs in <head> before first paint so the saved theme never flashes.
(function () {
  try {
    var raw = window.localStorage.getItem("chess.theme");
    var preference = raw ? JSON.parse(raw) : "dark";
    if (preference === "system") {
      preference = window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";
    }
    document.documentElement.dataset.theme = preference === "light" ? "light" : "dark";
  } catch (error) {
    document.documentElement.dataset.theme = "dark";
  }
})();
