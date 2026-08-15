// Main window shell: merged title bar + embedded Harness webview.
"use strict";

const params = new URLSearchParams(location.search);
const PORT = params.get("port");
const LANG = params.get("lang") || "en-US";

const I18N = {
  "zh-CN": { store: "插件商店", settings: "外壳设置", harnessSettings: "Harness 设置" },
  "en-US": { store: "Plugin Store", settings: "Settings", harnessSettings: "Harness Settings" },
};
const S = I18N[LANG] || I18N["en-US"];

document.getElementById("btnStore").textContent = S.store;
document.getElementById("btnSettings").textContent = S.settings;
document.getElementById("btnHarnessSettings").textContent = S.harnessSettings;

// Embed the live Harness WebUI (same-origin inside the guest webview).
const wv = document.getElementById("harness");
wv.setAttribute("src", `http://127.0.0.1:${PORT}/`);

// Harness restarts on a fresh port: repoint the webview there instead of
// replacing the shell page (the shell must outlive harness restarts).
window.shellApi.onHarnessPort((port) => {
  if (Number.isInteger(port) && port > 0) {
    wv.setAttribute("src", `http://127.0.0.1:${port}/`);
  }
});

document.getElementById("btnStore").addEventListener("click", () => window.shellApi.openStore());
document.getElementById("btnSettings").addEventListener("click", () => window.shellApi.openSettings());
document.getElementById("btnHarnessSettings").addEventListener("click", () => window.shellApi.openHarnessSettings());
