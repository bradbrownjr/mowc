(function () {
  var prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
  document.documentElement.setAttribute("data-theme", prefersLight ? "light" : "dark");
})();
