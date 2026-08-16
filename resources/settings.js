// Settings renderer.
"use strict";

const LANG = new URLSearchParams(location.search).get("lang") || "en-US";
const I18N = {
  "zh-CN": {
    title: "外壳设置", appearance: "外观与行为", about: "版本与更新",
    lang: "界面语言", langAuto: "跟随系统", autoHarness: "启动时检查 Harness 更新",
    autoShell: "启动时检查外壳更新", devtools: "启动时打开开发者工具",
    closeToTray: "关闭窗口时最小化到托盘（保持会话运行）",
    globalShortcut: "全局快捷键显示窗口（Ctrl+Alt+D）",
    autoLaunch: "开机自动启动",
    notifications: "桌面通知（审批 / 提问 / 任务完成 / 出错）",
    theme: "外观主题", themeLight: "浅色", themeDark: "深色",
    themes: {
      auto: "跟随系统", light: "浅色", dark: "深色",
      midnight: "深海蓝", forest: "森林绿", warm: "暖沙", contrast: "高对比",
    },
    verDesktop: "外壳版本", verHarness: "Harness 版本", verNode: "Node 版本",
    check: "检查更新", logs: "日志", openLogs: "打开日志目录", liveLogs: "实时查看",
    clearLogs: "清除日志", confirmClearLogs: "确定清除全部日志（desktop.log / harness.log 及其轮转文件）？",
    logsCleared: "日志已清除。",
    footer: "部分设置（语言、开发者工具）在重启后生效。",
  },
  "en-US": {
    title: "Shell Settings", appearance: "Appearance & Behavior", about: "Versions & Updates",
    lang: "Interface language", langAuto: "Follow system", autoHarness: "Check for Harness updates on startup",
    autoShell: "Check for shell updates on startup", devtools: "Open DevTools on startup",
    closeToTray: "Minimize to tray on close (keep sessions running)",
    globalShortcut: "Global hotkey to show the window (Ctrl+Alt+D)",
    autoLaunch: "Start with Windows",
    notifications: "Desktop notifications (approvals, questions, task finished, errors)",
    theme: "Appearance", themeLight: "Light", themeDark: "Dark",
    themes: {
      auto: "Follow system", light: "Light", dark: "Dark",
      midnight: "Midnight blue", forest: "Forest green", warm: "Warm sand", contrast: "High contrast",
    },
    verDesktop: "Shell version", verHarness: "Harness version", verNode: "Node version",
    check: "Check update", logs: "Logs", openLogs: "Open logs folder", liveLogs: "Live view",
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
{
  const sel = $("theme");
  sel.textContent = "";
  for (const [id, label] of Object.entries(S.themes)) {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = label;
    sel.append(opt);
  }
}
$("lblAutoHarness").textContent = S.autoHarness;
$("lblAutoShell").textContent = S.autoShell;
$("lblDevtools").textContent = S.devtools;
$("lblCloseToTray").textContent = S.closeToTray;
$("lblGlobalShortcut").textContent = S.globalShortcut;
$("lblAutoLaunch").textContent = S.autoLaunch;
$("lblNotifications").textContent = S.notifications;
$("lblVerDesktop").textContent = S.verDesktop;
$("lblVerHarness").textContent = S.verHarness;
$("lblVerNode").textContent = S.verNode;
$("checkShell").textContent = S.check;
$("checkHarness").textContent = S.check;
$("lblLogs").textContent = S.logs;
$("openLogs").textContent = S.openLogs;
$("liveLogs").textContent = S.liveLogs;
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
  $("closeToTray").checked = settings.closeToTray;
  $("globalShortcutEnabled").checked = settings.globalShortcutEnabled;
  $("autoLaunch").checked = settings.autoLaunch;
  $("notificationsEnabled").checked = settings.notificationsEnabled;
  $("verDesktop").textContent = versions.desktop;
  $("verHarness").textContent = versions.harness ?? "-";
  $("verNode").textContent = versions.node;
}

$("language").addEventListener("change", (e) => window.settingsApi.set({ language: e.target.value }));
$("theme").addEventListener("change", (e) => window.settingsApi.set({ theme: e.target.value }));
$("autoCheckUpdates").addEventListener("change", (e) => window.settingsApi.set({ autoCheckUpdates: e.target.checked }));
$("autoCheckShell").addEventListener("change", (e) => window.settingsApi.set({ autoCheckShell: e.target.checked }));
$("devtoolsOnStart").addEventListener("change", (e) => window.settingsApi.set({ devtoolsOnStart: e.target.checked }));
$("closeToTray").addEventListener("change", (e) => window.settingsApi.set({ closeToTray: e.target.checked }));
$("globalShortcutEnabled").addEventListener("change", (e) => window.settingsApi.set({ globalShortcutEnabled: e.target.checked }));
$("autoLaunch").addEventListener("change", (e) => window.settingsApi.set({ autoLaunch: e.target.checked }));
$("notificationsEnabled").addEventListener("change", (e) => window.settingsApi.set({ notificationsEnabled: e.target.checked }));
$("openLogs").addEventListener("click", () => window.settingsApi.openLogs());
$("liveLogs").addEventListener("click", () => window.settingsApi.openLogViewer());
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
