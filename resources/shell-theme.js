// Shared shell theme bootstrap. Loaded synchronously from every shell page.
// The main process delivers the palette twice: ?theme=<json> at load (no
// flash) and via the preload's onTheme push when the user switches themes.
"use strict";

(function () {
  function apply(payload) {
    if (!payload || !payload.colors) return;
    const style = document.documentElement.style;
    for (const [key, value] of Object.entries(payload.colors)) {
      if (typeof value === "string") style.setProperty("--" + key, value);
    }
    document.documentElement.dataset.theme = String(payload.id || "");
  }
  try {
    const raw = new URLSearchParams(location.search).get("theme");
    if (raw) apply(JSON.parse(raw));
  } catch {
    // malformed param — page CSS defaults stand
  }
  const api = ["shellApi", "settingsApi", "pluginApi", "onboardingApi", "sessionsApi", "logApi"]
    .map((name) => window[name])
    .find((a) => a && typeof a.onTheme === "function");
  if (api) api.onTheme(apply);
})();
