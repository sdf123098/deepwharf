// Main window shell: merged title bar + embedded Harness webview.
"use strict";

const params = new URLSearchParams(location.search);
const PORT = params.get("port");
const LANG = params.get("lang") || "en-US";

const I18N = {
  "zh-CN": { store: "插件商店", manager: "插件管理", settings: "外壳设置", harnessSettings: "Harness 设置", sessions: "会话", usage: "用量" },
  "en-US": { store: "Plugin Store", manager: "Plugins", settings: "Settings", harnessSettings: "Harness Settings", sessions: "Sessions", usage: "Usage" },
};
const S = I18N[LANG] || I18N["en-US"];

document.getElementById("btnSessions").textContent = S.sessions;
document.getElementById("btnUsage").textContent = S.usage;
document.getElementById("btnStore").textContent = S.store;
document.getElementById("btnPluginManager").textContent = S.manager;
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

document.getElementById("btnSessions").addEventListener("click", () => window.shellApi.openSessions());
document.getElementById("btnUsage").addEventListener("click", () => window.shellApi.openUsage());
document.getElementById("btnStore").addEventListener("click", () => window.shellApi.openStore());
document.getElementById("btnPluginManager").addEventListener("click", () => window.shellApi.openPluginManager());
document.getElementById("btnSettings").addEventListener("click", () => window.shellApi.openSettings());
document.getElementById("btnHarnessSettings").addEventListener("click", () => window.shellApi.openHarnessSettings());
