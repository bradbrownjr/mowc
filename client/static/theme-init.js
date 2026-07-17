(function () {
  var stored = null;
  try {
    stored = localStorage.getItem("mowc-theme");
  } catch {
    // Storage unavailable (private browsing etc); fall back to system.
  }
  var explicit = stored === "dark" || stored === "light" ? stored : null;
  var prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
  document.documentElement.setAttribute("data-theme", explicit || (prefersLight ? "light" : "dark"));
})();
