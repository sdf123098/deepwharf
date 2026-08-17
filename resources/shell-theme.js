// Shared shell theme bootstrap. Loaded synchronously from every shell page.
// The main process delivers the palette twice: ?theme=<json> at load (no
// flash) and via the preload's onTheme push when the user switches themes.
"use strict";

(function () {
  // Register the bundled HarmonyOS Sans SC faces (resources/fonts.css, served
  // via dsw-font://) so the configured font-family resolves on this machine.
  // Pages allow same-origin stylesheets through style-src 'self'.
  const fonts = document.createElement("link");
  fonts.rel = "stylesheet";
  fonts.href = "fonts.css";
  document.head.appendChild(fonts);

  function apply(payload) {
    if (!payload || !payload.colors) return;
    const style = document.documentElement.style;
    for (const [key, value] of Object.entries(payload.colors)) {
      if (typeof value === "string") style.setProperty("--" + key, value);
    }
    if (typeof payload.font === "string" && payload.font !== "") {
      style.setProperty("--font-family", payload.font);
      document.body.style.fontFamily = payload.font;
    }
    document.documentElement.dataset.theme = String(payload.id || "");
  }
  try {
    const raw = new URLSearchParams(location.search).get("theme");
    if (raw) apply(JSON.parse(raw));
  } catch {
    // malformed param — page CSS defaults stand
  }
  // Font arrives as its own query param too (pages that spread themeQuery).
  try {
    const f = new URLSearchParams(location.search).get("font");
    if (f) apply({ colors: {}, id: "", font: f });
  } catch {
    // malformed — ignore
  }
  const api = ["shellApi", "settingsApi", "pluginApi", "onboardingApi", "sessionsApi", "logApi"]
    .map((name) => window[name])
    .find((a) => a && typeof a.onTheme === "function");
  if (api) api.onTheme(apply);
})();
