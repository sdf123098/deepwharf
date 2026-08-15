// Settings renderer.
"use strict";

const LANG = new URLSearchParams(location.search).get("lang") || "en-US";
const I18N = {
  "zh-CN": {
    title: "外壳设置", appearance: "外观与行为", about: "版本与更新",
    lang: "界面语言", langAuto: "跟随系统", autoHarness: "启动时检查 Harness 更新",
    autoShell: "启动时检查外壳更新", devtools: "启动时打开开发者工具",
    theme: "外观主题", themeLight: "浅色", themeDark: "深色",
    verDesktop: "外壳版本", verHarness: "Harness 版本", verNode: "Node 版本",
    check: "检查更新", logs: "日志", openLogs: "打开日志目录",
    clearLogs: "清除日志", confirmClearLogs: "确定清除全部日志（desktop.log / harness.log 及其轮转文件）？",
    logsCleared: "日志已清除。",
    footer: "部分设置（语言、开发者工具）在重启后生效。",
  },
  "en-US": {
    title: "Shell Settings", appearance: "Appearance & Behavior", about: "Versions & Updates",
    lang: "Interface language", langAuto: "Follow system", autoHarness: "Check for Harness updates on startup",
    autoShell: "Check for shell updates on startup", devtools: "Open DevTools on startup",
    theme: "Appearance", themeLight: "Light", themeDark: "Dark",
    verDesktop: "Shell version", verHarness: "Harness version", verNode: "Node version",
    check: "Check update", logs: "Logs", openLogs: "Open logs folder",
    clearLogs: "Clear logs", confirmClearLogs: "Clear all logs (desktop.log / harness.log and rotated files)?",
    logsCleared: "Logs cleared.",
    footer: "Some settings (language, DevTools) apply after a restart.",
  },
};
const S = I18N[LANG] || I18N["en-US"];

const $ = (id) => document.getElementById(id);
document.title = S.title;
$("title").textContent = S.title;
$("secAppearance").textContent = S.appearance;
$("secAbout").textContent = S.about;
$("lblLang").textContent = S.lang;
$("language").options[0].textContent = S.langAuto;
$("lblTheme").textContent = S.theme;
$("theme").options[0].textContent = S.langAuto;
$("theme").options[1].textContent = S.themeLight;
$("theme").options[2].textContent = S.themeDark;
$("lblAutoHarness").textContent = S.autoHarness;
$("lblAutoShell").textContent = S.autoShell;
$("lblDevtools").textContent = S.devtools;
$("lblVerDesktop").textContent = S.verDesktop;
$("lblVerHarness").textContent = S.verHarness;
$("lblVerNode").textContent = S.verNode;
$("checkShell").textContent = S.check;
$("checkHarness").textContent = S.check;
$("lblLogs").textContent = S.logs;
$("openLogs").textContent = S.openLogs;
$("footer").textContent = S.footer;

async function load() {
  const [settings, versions] = await Promise.all([
    window.settingsApi.get(),
    window.settingsApi.versions(),
  ]);
  $("language").value = settings.language;
  $("theme").value = settings.theme;
  $("autoCheckUpdates").checked = settings.autoCheckUpdates;
  $("autoCheckShell").checked = settings.autoCheckShell;
  $("devtoolsOnStart").checked = settings.devtoolsOnStart;
  $("verDesktop").textContent = versions.desktop;
  $("verHarness").textContent = versions.harness ?? "-";
  $("verNode").textContent = versions.node;
}

$("language").addEventListener("change", (e) => window.settingsApi.set({ language: e.target.value }));
$("theme").addEventListener("change", (e) => window.settingsApi.set({ theme: e.target.value }));
$("autoCheckUpdates").addEventListener("change", (e) => window.settingsApi.set({ autoCheckUpdates: e.target.checked }));
$("autoCheckShell").addEventListener("change", (e) => window.settingsApi.set({ autoCheckShell: e.target.checked }));
$("devtoolsOnStart").addEventListener("change", (e) => window.settingsApi.set({ devtoolsOnStart: e.target.checked }));
$("openLogs").addEventListener("click", () => window.settingsApi.openLogs());
$("clearLogs").addEventListener("click", async () => {
  if (!confirm(S.confirmClearLogs)) return;
  await window.settingsApi.clearLogs();
  alert(S.logsCleared);
});
$("checkShell").addEventListener("click", () => window.settingsApi.checkShell());
$("checkHarness").addEventListener("click", async () => {
  await window.settingsApi.checkHarness();
  load();
});

load();
