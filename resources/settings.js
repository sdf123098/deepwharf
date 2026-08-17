// Merged settings renderer: 外壳 / Harness / 插件 / 用量 in one window.
"use strict";

const LANG = new URLSearchParams(location.search).get("lang") || "en-US";
const INITIAL_TAB = new URLSearchParams(location.search).get("tab") || "shell";

const I18N = {
  shell: {
    "zh-CN": {
      title: "设置", tabShell: "外壳", tabHarness: "Harness", tabPlugins: "插件", tabSessions: "会话", tabUsage: "用量",
      appearance: "外观与行为", about: "版本与更新",
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
      webuiGroup: "Web UI 主题（含主题插件）",
      webuiNone: "未发现 Web UI 主题插件",
      font: "全局字体", fontHint: "作用于外壳与 Harness Web UI，留空回退系统默认",
      fontSystem: "系统默认", fontCustom: "自定义：",
      remoteSec: "远程控制",
      remote: "启用远程控制（局域网 Web 控制台）",
      remoteHint: "开启后，手机或其他设备可通过浏览器访问控制台：查看/新建会话、发起对话、审批工具调用、回答问题、切换模型、中断任务。令牌鉴权，Harness 本体仍只监听本机。",
      remotePort: "监听端口", remotePortHint: "0 = 自动分配；同网段设备通过 控制台地址 访问",
      remoteToken: "访问令牌", remoteRegen: "重新生成",
      remoteUrl: "控制台地址", remoteRunning: "运行中 · :{port}", remoteStopped: "未运行",
      pet: "桌面宠物（互动 · 可举牌显示用量）",
      petHint: "拖拽移动 · 单击互动 · 双击打开窗口 · 右键菜单",
      petSign: "宠物举牌显示用量统计",
      verDesktop: "外壳版本", verHarness: "Harness 版本", verNode: "Node 版本",
      check: "检查更新", logs: "日志", openLogs: "打开日志目录", liveLogs: "实时查看",
      clearLogs: "清除日志", confirmClearLogs: "确定清除全部日志（desktop.log / harness.log 及其轮转文件）？",
      logsCleared: "日志已清除。",
      footer: "部分设置（语言、开发者工具）在重启后生效。",
    },
    "en-US": {
      title: "Settings", tabShell: "Shell", tabHarness: "Harness", tabPlugins: "Plugins", tabSessions: "Sessions", tabUsage: "Usage",
      appearance: "Appearance & Behavior", about: "Versions & Updates",
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
      webuiGroup: "Web UI themes (incl. theme plugins)",
      webuiNone: "no Web UI theme plugins found",
      font: "Global font", fontHint: "Applies to the shell and the Harness web UI; empty = system default",
      fontSystem: "System default", fontCustom: "Custom: ",
      remoteSec: "Remote control",
      remote: "Enable remote control (LAN web console)",
      remoteHint: "When on, a browser on your phone or another machine can reach the console: view/create sessions, send prompts, approve tool calls, answer questions, switch models, interrupt runs. Token-authenticated; the Harness itself stays loopback-only.",
      remotePort: "Listen port", remotePortHint: "0 = auto-pick; devices on the LAN use the Console URL below",
      remoteToken: "Access token", remoteRegen: "Regenerate",
      remoteUrl: "Console URL", remoteRunning: "running · :{port}", remoteStopped: "not running",
      pet: "Desktop pet (interactive · can hold a usage sign)",
      petHint: "drag to move · click to chat · double-click opens the window · right-click menu",
      petSign: "Pet holds the usage sign",
      verDesktop: "Shell version", verHarness: "Harness version", verNode: "Node version",
      check: "Check update", logs: "Logs", openLogs: "Open logs folder", liveLogs: "Live view",
      clearLogs: "Clear logs", confirmClearLogs: "Clear all logs (desktop.log / harness.log and rotated files)?",
      logsCleared: "Logs cleared.",
      footer: "Some settings (language, DevTools) apply after a restart.",
    },
  },
  harness: {
    "zh-CN": {
      secModel: "模型请求", secAdvanced: "高级",
      lblProvider: "提供方", official: "官方",
      lblRetry: "请求失败重试",
      retryHarnessDefault: "Harness 默认", retryRecommended: "推荐",
      retryUnstable: "网络不稳定", retryAlways: "持续重试", retryCustom: "自定义",
      retryDefaultDetail: "不写入固定重试参数，跟随 Harness 内置默认策略。",
      retryRecommendedDetail: "最多重试 6 次\n约：1s → 2s → 4s → 8s → 15s → 15s",
      retryUnstableDetail: "最多重试 8 次\n约：1.5s → 3s → 6s → 12s → 24s → 30s → 30s → 30s\n适合第三方 API、中转站、高峰期 502/503 与跨境网络。",
      retryAlwaysDetail: "请求会持续重试，直到成功、取消请求或 Harness 退出。不建议默认启用。",
      retryCustomDetail: "自定义（由 settings.yaml 设置）。只有切换到某个预设才会覆盖它。",
      lblTimeout: "请求超时", subTimeout: "模型请求超过该时长未返回即判定失败。",
      lblStreamIdle: "流式响应空闲超时", subStreamIdle: "模型已建立连接但长时间没有新的流式数据时，等待多久后判定请求失效。",
      lblWs: "WebSocket 连接超时", subWs: "与提供方的 WebSocket 连接建立超时时间。",
      reset: "恢复默认", appliesLive: "修改立即生效。", appliesRestart: "修改将在 Harness 重启后生效。",
      apply: "应用修改", lblStatus: "Harness 当前状态",
      statusRunning: "运行中", statusReadonly: "只读", statusRestarting: "重启中…", statusStopped: "已停止",
      restart: "重启 Harness", confirmRestart: "确定重启 Harness？正在进行的会话可能中断。",
      restartFailed: "重启失败", conflictReload: "Harness 配置已在其他位置发生变化。\n\n重新加载以显示最新配置？",
      applyFailed: "应用修改失败", errorText: "无法读取 Harness 设置。请确认 Harness 正在运行。",
      retry: "重试", noProviders: "未找到可配置的 Provider。请先在 Harness 的模型设置中添加 Provider。",
    },
    "en-US": {
      secModel: "Model Requests", secAdvanced: "Advanced",
      lblProvider: "Provider", official: "Official",
      lblRetry: "Retry on request failure",
      retryHarnessDefault: "Harness default", retryRecommended: "Recommended",
      retryUnstable: "Unstable network", retryAlways: "Retry forever", retryCustom: "Custom",
      retryDefaultDetail: "Writes no fixed retry parameters; follows the Harness built-in defaults.",
      retryRecommendedDetail: "Up to 6 retries\n≈ 1s → 2s → 4s → 8s → 15s → 15s",
      retryUnstableDetail: "Up to 8 retries\n≈ 1.5s → 3s → 6s → 12s → 24s → 30s → 30s → 30s\nGood for third-party APIs, gateways, peak-hour 502/503 and cross-border networks.",
      retryAlwaysDetail: "Requests keep retrying until they succeed, are cancelled, or the Harness exits. Not recommended as the default.",
      retryCustomDetail: "Custom (set in settings.yaml). Only overwritten when you switch to a preset.",
      lblTimeout: "Request timeout", subTimeout: "Fails the request when the model takes longer than this to respond.",
      lblStreamIdle: "Stream idle timeout", subStreamIdle: "How long to wait after the connection is established before a stream with no new data is considered failed.",
      lblWs: "WebSocket connect timeout", subWs: "Timeout for establishing the WebSocket connection to the provider.",
      reset: "Reset to default", appliesLive: "Changes apply immediately.", appliesRestart: "Changes take effect after the Harness restarts.",
      apply: "Apply changes", lblStatus: "Harness status",
      statusRunning: "Running", statusReadonly: "Read-only", statusRestarting: "Restarting…", statusStopped: "Stopped",
      restart: "Restart Harness", confirmRestart: "Restart the Harness? In-flight sessions may be interrupted.",
      restartFailed: "Restart failed", conflictReload: "The Harness configuration changed elsewhere.\n\nReload to show the latest configuration?",
      applyFailed: "Failed to apply changes", errorText: "Cannot read Harness settings. Make sure the Harness is running.",
      retry: "Retry", noProviders: "No configurable providers found. Add a provider in the Harness model settings first.",
    },
  },
  plugins: {
    "zh-CN": {
      tabs: { plugins: "插件", mcp: "MCP 服务器", skills: "技能" },
      refresh: "刷新", restart: "重启 Harness 生效",
      pluginsFootnote: "停用通过官方 cordis.patch.yml 的 disabled 覆盖实现（不卸载）；卸载/更新走官方 dsh plugin（pnpm）。变更后需重启。",
      mcpFootnote: "MCP 服务器即 profile 中的 dsh-mcp-client 实例；新增/停用/删除通过官方 cordis.patch.yml 补丁层，变更后需重启。",
      skillsFootnote: "技能按会话可见性列出（官方 skill.list）；技能文件位于 DSH_HOME/skills。",
      kindInbox: "内置", kindLayer: "插件层", kindPlain: "普通依赖",
      enabled: "已启用", disabledTag: "已停用", noEntries: "无配置条目",
      toggleOff: "停用", toggleOn: "启用", removeBtn: "卸载", updateBtn: "更新",
      confirmRemove: "确定卸载 {name}？", needRestart: "已变更。重启 Harness 后生效，现在重启？",
      emptyPlugins: "还没有安装任何插件。去插件商店安装。",
      mcpAddTitle: "新增 MCP 服务器",
      name: "名称（serverName）", transport: "传输",
      command: "命令 (command)", args: "参数（每行一个）", env: "环境变量（每行 KEY=VALUE）",
      url: "URL", headers: "请求头（每行 KEY: VALUE）",
      add: "添加", cancel: "取消",
      mcpEmpty: "还没有配置 MCP 服务器。",
      provided: "插件提供", ours: "可删除",
      deleteBtn: "删除",
      pluginProvidedMsg: "该服务器由插件提供，无法直接删除——已为你停用（可再启用）。",
      skillsOpenDir: "打开技能目录",
      skillsEmpty: "会话暂无可见技能。技能是 DSH_HOME/skills 下的 SKILL.md。",
      skillInvocable: "可被模型调用",
      error: "操作失败：{error}",
    },
    "en-US": {
      tabs: { plugins: "Plugins", mcp: "MCP servers", skills: "Skills" },
      refresh: "Refresh", restart: "Restart Harness to apply",
      pluginsFootnote: "Disable uses the official cordis.patch.yml disabled override (no uninstall); update/uninstall go through the official dsh plugin (pnpm). Restart after changes.",
      mcpFootnote: "An MCP server is a dsh-client instance in the profile; add/disable/remove ride the official cordis.patch.yml layer — restart after changes.",
      skillsFootnote: "Skills listed per-session visibility (official skill.list); skill files live in DSH_HOME/skills.",
      kindInbox: "built-in", kindLayer: "plugin layer", kindPlain: "plain dep",
      enabled: "enabled", disabledTag: "disabled", noEntries: "no entries",
      toggleOff: "Disable", toggleOn: "Enable", removeBtn: "Uninstall", updateBtn: "Update",
      confirmRemove: "Uninstall {name}?", needRestart: "Changed. Restart Harness to apply — restart now?",
      emptyPlugins: "No plugins installed yet — get some from the Plugin Store.",
      mcpAddTitle: "Add MCP server",
      name: "Name (serverName)", transport: "Transport",
      command: "Command", args: "Args (one per line)", env: "Env (KEY=VALUE per line)",
      url: "URL", headers: "Headers (KEY: VALUE per line)",
      add: "Add", cancel: "Cancel",
      mcpEmpty: "No MCP servers configured.",
      provided: "plugin-provided", ours: "removable",
      deleteBtn: "Delete",
      pluginProvidedMsg: "This server comes from a plugin and cannot be deleted — disabled it instead (re-enable anytime).",
      skillsOpenDir: "Open skills folder",
      skillsEmpty: "No skills visible to the session yet. Skills are SKILL.md folders under DSH_HOME/skills.",
      skillInvocable: "model-invocable",
      error: "Operation failed: {error}",
    },
  },
  usage: {
    "zh-CN": {
      refresh: "刷新", pickSession: "选择会话…",
      noSessions: "还没有会话。在主窗口发起一个任务后，这里会实时显示它的 token 用量。",
      noUsage: "该会话还没有用量数据（跑一个任务后出现）。",
      live: "运行中 · 实时",
      hitRate: "缓存命中率", hitRateHint: "命中读取 ÷ 全部输入",
      noHit: "暂无输入",
      context: "上下文占用",
      contextOf: "{used} / {win}",
      contextUnknown: "{used} · 窗口未知",
      contextLegend: "按下次请求的预计占用计算；接近上限时考虑 /compact。",
      totalIn: "输入合计", cacheRead: "缓存命中", cacheWrite: "缓存写入",
      uncached: "未命中输入", output: "输出", composition: "输入构成",
      emptyBar: "等待数据…",
      footnote: "数据来自 Harness 官方 token-meter 投影，随会话实时刷新。",
    },
    "en-US": {
      refresh: "Refresh", pickSession: "Pick a session…",
      noSessions: "No sessions yet. Start a task in the main window and its token usage will stream here live.",
      noUsage: "This session has no usage data yet (appears after the first turn).",
      live: "Running · live",
      hitRate: "Cache hit rate", hitRateHint: "cache reads ÷ all input",
      noHit: "no input yet",
      context: "Context occupancy",
      contextOf: "{used} / {win}",
      contextUnknown: "{used} · window unknown",
      contextLegend: "Based on projected next-request occupancy; consider /compact near the limit.",
      totalIn: "Total input", cacheRead: "Cache hits", cacheWrite: "Cache writes",
      uncached: "Uncached input", output: "Output", composition: "Input composition",
      emptyBar: "waiting for data…",
      footnote: "Data comes from the official Harness token-meter projection, live per session.",
    },
  },
  sessions: {
    "zh-CN": {
      searchPlaceholder: "全文搜索会话…", refresh: "刷新", showBlank: "显示空白会话",
      running: "运行中", untitled: "（未命名）", export: "导出", empty: "没有会话。",
      searchMore: "结果超过 20 条，仅显示前 20 条。", exportDone: "已导出：{path}",
      error: "操作失败：{error}",
      footer: "导出为 ZIP（session.jsonl + 子代理 + 图片附件），来自 Harness 官方 session.export。",
      timeNow: "刚刚", timeMin: "{n} 分钟前", timeHour: "{n} 小时前", timeDay: "{n} 天前",
    },
    "en-US": {
      searchPlaceholder: "Full-text session search…", refresh: "Refresh", showBlank: "Show blank sessions",
      running: "Running", untitled: "(untitled)", export: "Export", empty: "No sessions.",
      searchMore: "More than 20 results; showing the first 20.", exportDone: "Exported: {path}",
      error: "Operation failed: {error}",
      footer: "Exports a ZIP (session.jsonl + subagents + media attachments) via the official Harness session.export.",
      timeNow: "just now", timeMin: "{n} min ago", timeHour: "{n} h ago", timeDay: "{n} d ago",
    },
  },
};
const SS = I18N.shell[LANG] || I18N.shell["en-US"];
const SH = I18N.harness[LANG] || I18N.harness["en-US"];
const SP = I18N.plugins[LANG] || I18N.plugins["en-US"];
const SU = I18N.usage[LANG] || I18N.usage["en-US"];
const SV = I18N.sessions[LANG] || I18N.sessions["en-US"];

const $ = (id) => document.getElementById(id);

// --- frameless chrome --------------------------------------------------------

$("chromeTitle").textContent = SS.title;
$("chromeClose").addEventListener("click", () => window.close());

// --- main tabs ---------------------------------------------------------------

const MAIN_TABS = [
  ["shell", "tabShell", "paneShell"],
  ["harness", "tabHarness", "paneHarness"],
  ["plugins", "tabPlugins", "panePlugins"],
  ["sessions", "tabSessions", "paneSessions"],
  ["usage", "tabUsage", "paneUsage"],
];
const TAB_LABELS = {
  shell: SS.tabShell, harness: SS.tabHarness, plugins: SS.tabPlugins,
  sessions: SS.tabSessions, usage: SS.tabUsage,
};
const inited = { shell: false, harness: false, plugins: false, sessions: false, usage: false };

for (const [k, tabId] of MAIN_TABS) $(tabId).textContent = TAB_LABELS[k];
function showTab(key) {
  for (const [k, tabId, paneId] of MAIN_TABS) {
    $(tabId).classList.toggle("active", k === key);
    $(paneId).classList.toggle("active", k === key);
  }
  if (!inited[key]) {
    inited[key] = true;
    INIT[key]();
  } else if (key === "plugins") {
    pluginsLoad();
  } else if (key === "sessions") {
    sessionsLoad();
  } else if (key === "usage") {
    usageLoad();
  }
}
for (const [key, tabId] of MAIN_TABS) {
  $(tabId).addEventListener("click", () => showTab(key));
}
const INIT = {}; // filled below by each feature

// ============================= 外壳设置 =============================

$("secAppearance").textContent = SS.appearance;
$("secAbout").textContent = SS.about;
$("lblLang").textContent = SS.lang;
$("language").options[0].textContent = SS.langAuto;
$("lblTheme").textContent = SS.theme;
$("lblFont").textContent = SS.font;
$("fontHint").textContent = SS.fontHint;

// Theme picker: the shell's own palettes plus everything the web UI's theme
// registry enumerated (companion extras map to shell ids; the rest — theme
// plugins — ride in as "webui:<id>" entries handled by the bridge).
const SHELL_OWNED = ["auto", "light", "dark", "midnight", "forest", "warm", "contrast"];
function buildThemeSelect(webuiThemes, current) {
  const sel = $("theme");
  sel.textContent = "";
  for (const [id, label] of Object.entries(SS.themes)) {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = label;
    sel.append(opt);
  }
  const extra = (webuiThemes || []).filter((t) => !SHELL_OWNED.includes(t.id));
  if (extra.length === 0 && !String(current || "").startsWith("webui:")) return;
  const group = document.createElement("optgroup");
  group.label = SS.webuiGroup;
  if (extra.length === 0) {
    const none = document.createElement("option");
    none.disabled = true;
    none.textContent = SS.webuiNone;
    group.append(none);
  }
  for (const t of extra) {
    const opt = document.createElement("option");
    opt.value = `webui:${t.id}`;
    opt.textContent = t.label || t.id;
    group.append(opt);
  }
  sel.append(group);
}

// Font picker: preset families only — no free-text input. Any custom value a
// config already carries (typed in before the dropdown existed) rides in as
// its own entry so it round-trips instead of being silently dropped.
const FONT_PRESETS = [
  "HarmonyOS Sans SC",
  "HarmonyOS Sans",
  "Microsoft YaHei",
  "DengXian",
  "Noto Sans CJK SC",
  "Segoe UI",
  "system-ui",
];
function buildFontSelect(current) {
  const sel = $("fontFamily");
  sel.textContent = "";
  sel.append(new Option(SS.fontSystem, ""));
  for (const f of FONT_PRESETS) sel.append(new Option(f, f));
  const cur = String(current || "").trim();
  if (cur && !FONT_PRESETS.includes(cur)) sel.append(new Option(SS.fontCustom + cur, cur));
  sel.value = cur;
}

$("lblAutoHarness").textContent = SS.autoHarness;
$("lblAutoShell").textContent = SS.autoShell;
$("lblDevtools").textContent = SS.devtools;
$("lblCloseToTray").textContent = SS.closeToTray;
$("lblGlobalShortcut").textContent = SS.globalShortcut;
$("lblAutoLaunch").textContent = SS.autoLaunch;
$("lblNotifications").textContent = SS.notifications;
$("secRemote").textContent = SS.remoteSec;
$("lblRemote").textContent = SS.remote;
$("remoteHint").textContent = SS.remoteHint;
$("lblRemotePort").textContent = SS.remotePort;
$("remotePortHint").textContent = SS.remotePortHint;
$("lblRemoteToken").textContent = SS.remoteToken;
$("remoteRegen").textContent = SS.remoteRegen;
$("lblRemoteUrl").textContent = SS.remoteUrl;
$("lblPet").textContent = SS.pet;
$("petHint").textContent = SS.petHint;
$("lblPetSign").textContent = SS.petSign;
$("lblVerDesktop").textContent = SS.verDesktop;
$("lblVerHarness").textContent = SS.verHarness;
$("lblVerNode").textContent = SS.verNode;
$("checkShell").textContent = SS.check;
$("checkHarness").textContent = SS.check;
$("lblLogs").textContent = SS.logs;
$("openLogs").textContent = SS.openLogs;
$("liveLogs").textContent = SS.liveLogs;
$("shellFooter").textContent = SS.footer;

let shellLoaded = false;
async function shellLoad() {
  const [settings, versions] = await Promise.all([
    window.settingsApi.get(),
    window.settingsApi.versions(),
  ]);
  $("language").value = settings.language;
  buildThemeSelect(settings.webuiThemes, settings.theme);
  $("theme").value = settings.theme;
  if (!$("theme").value && String(settings.theme).startsWith("webui:")) {
    const opt = document.createElement("option");
    opt.value = settings.theme;
    opt.textContent = settings.theme.slice("webui:".length);
    $("theme").append(opt);
    $("theme").value = settings.theme;
  }
  buildFontSelect(settings.fontFamily);
  $("autoCheckUpdates").checked = settings.autoCheckUpdates;
  $("autoCheckShell").checked = settings.autoCheckShell;
  $("devtoolsOnStart").checked = settings.devtoolsOnStart;
  $("closeToTray").checked = settings.closeToTray;
  $("globalShortcutEnabled").checked = settings.globalShortcutEnabled;
  $("autoLaunch").checked = settings.autoLaunch;
  $("notificationsEnabled").checked = settings.notificationsEnabled;
  $("petEnabled").checked = settings.petEnabled;
  $("petSignEnabled").checked = settings.petSignEnabled;
  $("remoteEnabled").checked = settings.remoteEnabled === true;
  $("remotePort").value = settings.remotePort ? String(settings.remotePort) : "";
  $("verDesktop").textContent = versions.desktop;
  $("verHarness").textContent = versions.harness ?? "-";
  $("verNode").textContent = versions.node;
  shellLoaded = true;
  remoteRefresh();
}

function shellSet(patch) {
  window.settingsApi.set(patch).then((next) => {
    // keep the picker in sync with what the main process accepted
    if (patch.theme !== undefined && next && next.theme !== undefined) $("theme").value = next.theme;
  });
}
$("language").addEventListener("change", (e) => shellSet({ language: e.target.value }));
$("theme").addEventListener("change", (e) => shellSet({ theme: e.target.value }));
$("fontFamily").addEventListener("change", (e) => shellSet({ fontFamily: e.target.value }));
$("autoCheckUpdates").addEventListener("change", (e) => shellSet({ autoCheckUpdates: e.target.checked }));
$("autoCheckShell").addEventListener("change", (e) => shellSet({ autoCheckShell: e.target.checked }));
$("devtoolsOnStart").addEventListener("change", (e) => shellSet({ devtoolsOnStart: e.target.checked }));
$("closeToTray").addEventListener("change", (e) => shellSet({ closeToTray: e.target.checked }));
$("globalShortcutEnabled").addEventListener("change", (e) => shellSet({ globalShortcutEnabled: e.target.checked }));
$("autoLaunch").addEventListener("change", (e) => shellSet({ autoLaunch: e.target.checked }));
$("notificationsEnabled").addEventListener("change", (e) => shellSet({ notificationsEnabled: e.target.checked }));
$("petEnabled").addEventListener("change", (e) => shellSet({ petEnabled: e.target.checked }));
$("petSignEnabled").addEventListener("change", (e) => shellSet({ petSignEnabled: e.target.checked }));
$("openLogs").addEventListener("click", () => window.settingsApi.openLogs());
$("liveLogs").addEventListener("click", () => window.settingsApi.openLogViewer());
$("clearLogs").addEventListener("click", async () => {
  if (!confirm(SS.confirmClearLogs)) return;
  await window.settingsApi.clearLogs();
  alert(SS.logsCleared);
});
$("checkShell").addEventListener("click", () => window.settingsApi.checkShell());
$("checkHarness").addEventListener("click", async () => {
  await window.settingsApi.checkHarness();
  shellLoad();
});

INIT.shell = shellLoad;

// ============================= Harness 设置 =============================

$("secModel").textContent = SH.secModel;
$("secAdvanced").textContent = SH.secAdvanced;
$("lblProvider").textContent = SH.lblProvider;
$("lblRetry").textContent = SH.lblRetry;
$("lblTimeout").textContent = SH.lblTimeout;
$("subTimeout").textContent = SH.subTimeout;
$("lblStreamIdle").textContent = SH.lblStreamIdle;
$("subStreamIdle").textContent = SH.subStreamIdle;
$("lblWs").textContent = SH.lblWs;
$("subWs").textContent = SH.subWs;
$("lblStatus").textContent = SH.lblStatus;
$("apply").textContent = SH.apply;
$("restart").textContent = SH.restart;
$("harnessRetry").textContent = SH.retry;
$("harnessErrorText").textContent = SH.errorText;
$("resetTimeoutMs").textContent = SH.reset;
$("resetStreamIdle").textContent = SH.reset;
$("resetWs").textContent = SH.reset;
{
  const retrySel = $("retry");
  const labels = {
    "harness-default": SH.retryHarnessDefault, recommended: SH.retryRecommended,
    unstable: SH.retryUnstable, always: SH.retryAlways, custom: SH.retryCustom,
  };
  for (const opt of retrySel.options) opt.textContent = labels[opt.value] || opt.textContent;
}

const RETRY_DETAIL = {
  "harness-default": SH.retryDefaultDetail,
  recommended: SH.retryRecommendedDetail,
  unstable: SH.retryUnstableDetail,
  always: SH.retryAlwaysDetail,
  custom: SH.retryCustomDetail,
};

let harnessView = null; // HarnessSettingsView
let harnessProvider = null; // ProviderView
let harnessDirty = false;

function harnessSetDirty(d) {
  harnessDirty = d;
  $("apply").disabled = !d;
}

function secsToInput(ms) {
  return ms && ms > 0 ? String(Math.round(ms / 1000)) : "";
}
function readSecs(input) {
  const v = input.value.trim();
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}
function loadedSecs(ms) {
  return ms && ms > 0 ? Math.round(ms / 1000) : null;
}

function harnessSelectProvider(id) {
  const p = harnessView.providers.find((x) => x.id === id) ?? harnessView.providers[0];
  if (!p) {
    harnessProvider = null;
    harnessSetDirty(false);
    $("retryDetail").textContent = SH.noProviders;
    $("retryDetail").className = "hint";
    return;
  }
  harnessProvider = p;
  $("provider").value = p.id;
  $("retry").value = p.retryChoice;
  $("retryDetail").textContent = RETRY_DETAIL[p.retryChoice];
  $("retryDetail").className = "hint" + (p.retryChoice === "always" ? " warn" : "");
  $("rowTimeoutMs").hidden = !p.capabilities.timeoutMs;
  $("timeoutMs").value = secsToInput(p.timeoutMs);
  $("rowStreamIdle").hidden = !p.capabilities.streamIdleTimeoutMs;
  $("streamIdle").value = secsToInput(p.streamIdleTimeoutMs);
  $("rowWs").hidden = !p.capabilities.websocketConnectTimeoutMs;
  $("ws").value = secsToInput(p.websocketConnectTimeoutMs);
  $("appliesHint").textContent = p.applies === "restart" ? SH.appliesRestart : SH.appliesLive;
  harnessSetDirty(false);
}

function harnessRender() {
  const sel = $("provider");
  sel.innerHTML = "";
  for (const p of harnessView.providers) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.kind === "deepseek" ? `${p.displayName}（${SH.official}）` : p.displayName;
    sel.appendChild(opt);
  }
  $("status").textContent = harnessView.writable ? SH.statusRunning : SH.statusReadonly;
  harnessSelectProvider(sel.value);
}

function harnessShowError() {
  $("harnessContent").hidden = true;
  $("harnessError").hidden = false;
}

async function harnessLoad() {
  const res = await window.harnessSettingsApi.get();
  if (!res.ok) {
    harnessShowError();
    return;
  }
  harnessView = res.view;
  $("harnessError").hidden = true;
  $("harnessContent").hidden = false;
  harnessRender();
}

$("provider").addEventListener("change", () => harnessSelectProvider($("provider").value));
$("retry").addEventListener("change", () => {
  const c = $("retry").value;
  $("retryDetail").textContent = RETRY_DETAIL[c];
  $("retryDetail").className = "hint" + (c === "always" ? " warn" : "");
  harnessSetDirty(true);
});
["timeoutMs", "streamIdle", "ws"].forEach((id) => {
  $(id).addEventListener("input", () => harnessSetDirty(true));
  $(id).addEventListener("change", () => harnessSetDirty(true));
});
$("resetTimeoutMs").addEventListener("click", () => { $("timeoutMs").value = ""; harnessSetDirty(true); });
$("resetStreamIdle").addEventListener("click", () => { $("streamIdle").value = ""; harnessSetDirty(true); });
$("resetWs").addEventListener("click", () => { $("ws").value = ""; harnessSetDirty(true); });

$("apply").addEventListener("click", async () => {
  if (!harnessProvider || !harnessDirty) return;
  const edits = {};
  const retry = $("retry").value;
  if (retry !== harnessProvider.retryChoice) edits.retry = retry;
  const t = readSecs($("timeoutMs"));
  if (t !== loadedSecs(harnessProvider.timeoutMs)) edits.timeoutMsSec = t;
  const si = readSecs($("streamIdle"));
  if (si !== loadedSecs(harnessProvider.streamIdleTimeoutMs)) edits.streamIdleTimeoutMsSec = si;
  const w = readSecs($("ws"));
  if (w !== loadedSecs(harnessProvider.websocketConnectTimeoutMs)) edits.websocketConnectTimeoutMsSec = w;

  if (Object.keys(edits).length === 0) {
    harnessSetDirty(false);
    return;
  }
  $("apply").disabled = true;
  const res = await window.harnessSettingsApi.apply({
    providerId: harnessProvider.id,
    ns: harnessProvider.ns,
    revision: harnessProvider.revision,
    edits,
  });
  if (res.ok) {
    await harnessLoad();
    return;
  }
  if (res.conflict) {
    if (confirm(SH.conflictReload)) {
      await harnessLoad();
    } else {
      harnessSetDirty(true);
    }
    return;
  }
  alert(`${SH.applyFailed}\n${res.error || ""}`);
  harnessSetDirty(true);
});

$("restart").addEventListener("click", async () => {
  if (!confirm(SH.confirmRestart)) return;
  $("restart").disabled = true;
  $("status").textContent = SH.statusRestarting;
  const res = await window.harnessSettingsApi.restart();
  if (!res.ok) {
    alert(`${SH.restartFailed}\n${res.error || ""}`);
    $("status").textContent = SH.statusRunning;
    $("restart").disabled = false;
    return;
  }
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const r2 = await window.harnessSettingsApi.get();
    if (r2.ok) {
      harnessView = r2.view;
      $("restart").disabled = false;
      harnessRender();
      return;
    }
  }
  $("restart").disabled = false;
  harnessShowError();
});

$("harnessRetry").addEventListener("click", () => harnessLoad());

INIT.harness = harnessLoad;

// ============================= 插件管理 =============================

$("pmTabPlugins").textContent = SP.tabs.plugins;
$("pmTabMcp").textContent = SP.tabs.mcp;
$("pmTabSkills").textContent = SP.tabs.skills;
$("pmRefresh").textContent = SP.refresh;
$("pmRestart").textContent = SP.restart;

let pmTab = "plugins";
let pmFootnote = "";
let pmNeedRestart = false;

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function pmMsg(text, err) {
  const m = $("msg");
  m.className = "msg" + (err ? " err" : "");
  m.textContent = text || "";
}
function pmMarkChanged() {
  pmNeedRestart = true;
  $("pmRestart").style.display = "";
}
async function pmMaybeRestart() {
  if (!pmNeedRestart) return;
  if (confirm(SP.needRestart)) {
    pmMsg("");
    await window.managerApi.restart();
    pmNeedRestart = false;
    $("pmRestart").style.display = "none";
    pluginsLoad();
  }
}
$("pmRestart").addEventListener("click", pmMaybeRestart);
$("pmRefresh").addEventListener("click", pluginsLoad);

for (const [tabId, paneId, key, footnote] of [
  ["pmTabPlugins", "pmPanePlugins", "plugins", SP.pluginsFootnote],
  ["pmTabMcp", "pmPaneMcp", "mcp", SP.mcpFootnote],
  ["pmTabSkills", "pmPaneSkills", "skills", SP.skillsFootnote],
]) {
  $(tabId).addEventListener("click", () => {
    pmTab = key;
    $("pmTabPlugins").classList.toggle("active", key === "plugins");
    $("pmTabMcp").classList.toggle("active", key === "mcp");
    $("pmTabSkills").classList.toggle("active", key === "skills");
    $("pmPanePlugins").style.display = key === "plugins" ? "" : "none";
    $("pmPaneMcp").style.display = key === "mcp" ? "" : "none";
    $("pmPaneSkills").style.display = key === "skills" ? "" : "none";
    $("pmFootnote").textContent = footnote;
    pluginsLoad();
  });
}
$("pmFootnote").textContent = SP.pluginsFootnote;

function pluginRow(p) {
  const isInbox = p.kind === "inbox";
  const state = isInbox
    ? `<span class="tag">${esc(SP.kindInbox)}</span>`
    : p.entryCount === 0
      ? `<span class="tag">${esc(p.kind === "plain" ? SP.kindPlain : SP.kindLayer)} · ${esc(SP.noEntries)}</span>`
      : p.disabled
        ? `<span class="tag off">${esc(SP.disabledTag)}</span>`
        : `<span class="tag ok">${esc(SP.enabled)}</span>`;
  const kind = p.kind === "plain" ? SP.kindPlain : SP.kindLayer;
  const actions = isInbox ? "" : `
    <div class="actions">
      ${p.entryCount > 0 ? `<button class="act" data-toggle="${esc(p.name)}" data-disable="${p.disabled ? "0" : "1"}">${p.disabled ? esc(SP.toggleOn) : esc(SP.toggleOff)}</button>` : ""}
      <button class="act" data-update="${esc(p.name)}">${esc(SP.updateBtn)}</button>
      <button class="act danger" data-remove="${esc(p.name)}">${esc(SP.removeBtn)}</button>
    </div>`;
  return `<div class="row">
    <div class="body">
      <div class="t"><code>${esc(p.name)}</code> ${p.version ? `<span class="tag">${esc(p.version)}</span>` : ""} ${state}</div>
      <div class="m">${esc(p.spec || kind)}</div>
    </div>
    ${actions}
  </div>`;
}

async function pluginsLoadPlugins() {
  const pane = $("pmPanePlugins");
  const r = await window.managerApi.list();
  if (!r.items.length) {
    pane.innerHTML = `<div class="empty">${esc(SP.emptyPlugins)}</div>`;
    return;
  }
  if (r.degraded) pmMsg("dump-config 不可用，停用状态未知", true);
  pane.innerHTML = r.items.map(pluginRow).join("");
}

$("pmPanePlugins").addEventListener("click", async (e) => {
  const toggle = e.target.closest("button[data-toggle]");
  if (toggle) {
    toggle.disabled = true;
    const r = await window.managerApi.toggle(toggle.dataset.toggle, toggle.dataset.disable === "1");
    toggle.disabled = false;
    if (!r.ok) { pmMsg(SP.error.replace("{error}", r.error || "?"), true); return; }
    pmMsg(""); pmMarkChanged(); pluginsLoadPlugins();
    return;
  }
  const update = e.target.closest("button[data-update]");
  if (update) {
    update.disabled = true;
    const r = await window.managerApi.update(update.dataset.update);
    if (!r.ok) { pmMsg(SP.error.replace("{error}", r.error || "?"), true); update.disabled = false; return; }
    pmMsg(""); pmMarkChanged(); pluginsLoadPlugins();
    return;
  }
  const remove = e.target.closest("button[data-remove]");
  if (remove) {
    if (!confirm(SP.confirmRemove.replace("{name}", remove.dataset.remove))) return;
    remove.disabled = true;
    const r = await window.managerApi.remove(remove.dataset.remove);
    if (!r.ok) { pmMsg(SP.error.replace("{error}", r.error || "?"), true); remove.disabled = false; return; }
    pmMsg(""); pmMarkChanged(); pluginsLoadPlugins();
  }
});

function mcpRow(m) {
  const target = m.command || m.url || "";
  const state = m.disabled ? `<span class="tag off">${esc(SP.disabledTag)}</span>` : `<span class="tag ok">${esc(SP.enabled)}</span>`;
  const src = m.ours ? `<span class="tag">${esc(SP.ours)}</span>` : `<span class="tag">${esc(SP.provided)}</span>`;
  return `<div class="row">
    <div class="body">
      <div class="t"><code>${esc(m.serverName)}</code> <span class="tag">${esc(m.transport)}</span> ${state} ${src}</div>
      <div class="m">${esc(target)}${m.argsCount ? " · " + m.argsCount + " args" : ""}</div>
    </div>
    <div class="actions">
      <button class="act" data-mcponoff="${esc(m.id)}|${esc(m.serverName)}|${m.disabled ? "0" : "1"}">${m.disabled ? esc(SP.toggleOn) : esc(SP.toggleOff)}</button>
      ${m.ours ? `<button class="act danger" data-mcpdel="${esc(m.serverName)}">${esc(SP.deleteBtn)}</button>` : ""}
    </div>
  </div>`;
}

let pmAddFormOpen = false;
let pmLastMcp = [];

function pmRenderMcp() {
  const pane = $("pmPaneMcp");
  const form = pmAddFormOpen ? pmMcpFormHtml() : "";
  const list = pmLastMcp.length
    ? pmLastMcp.map(mcpRow).join("")
    : `<div class="empty">${esc(SP.mcpEmpty)}</div>`;
  pane.innerHTML = `
    <div style="display:flex; gap:8px; margin-bottom:10px;">
      <button class="act primary" id="mcpAddToggle">${esc(SP.mcpAddTitle)}</button>
      <button class="act" id="mcpOpenConfig">cordis.patch.yml</button>
    </div>
    ${form}
    ${list}`;
  $("mcpAddToggle").addEventListener("click", () => { pmAddFormOpen = !pmAddFormOpen; pmRenderMcp(); });
  $("mcpOpenConfig").addEventListener("click", () => window.managerApi.mcpOpenConfig());
  const formEl = pane.querySelector("form");
  if (formEl) formEl.addEventListener("submit", pmOnMcpAdd);
}

function pmMcpFormHtml() {
  return `<form class="add" id="mcpForm">
    <div class="grid">
      <label>${esc(SP.name)}<input name="serverName" required pattern="[A-Za-z0-9][A-Za-z0-9_-]*"></label>
      <label>${esc(SP.transport)}<select name="transport"><option value="stdio">stdio</option><option value="streamable-http">streamable-http</option></select></label>
    </div>
    <div class="grid" data-mode="stdio">
      <label class="full">${esc(SP.command)}<input name="command" placeholder="npx -y ... 或 C:\\path\\to\\cmd"></label>
      <label>${esc(SP.args)}<textarea name="args"></textarea></label>
      <label>${esc(SP.env)}<textarea name="env"></textarea></label>
    </div>
    <div class="grid" data-mode="streamable-http" style="display:none">
      <label class="full">${esc(SP.url)}<input name="url" placeholder="https://…/mcp"></label>
      <label class="full">${esc(SP.headers)}<textarea name="headers"></textarea></label>
    </div>
    <div style="display:flex; gap:8px; justify-content:flex-end;">
      <button class="act" type="button" id="mcpCancel">${esc(SP.cancel)}</button>
      <button class="act primary" type="submit">${esc(SP.add)}</button>
    </div>
  </form>`;
}

function parseLines(text, sep) {
  const out = [];
  for (const line of String(text || "").split("\n")) {
    const t = line.trim();
    if (t === "") continue;
    if (sep === "=") {
      const i = t.indexOf("=");
      if (i > 0) out.push([t.slice(0, i).trim(), t.slice(i + 1)]);
    } else {
      const i = t.indexOf(":");
      if (i > 0) out.push([t.slice(0, i).trim(), t.slice(i + 1).trim()]);
    }
  }
  return out;
}

async function pmOnMcpAdd(ev) {
  ev.preventDefault();
  const f = ev.target;
  const transport = f.transport.value;
  const server = {
    serverName: f.serverName.value,
    transport,
    command: f.command?.value ?? "",
    args: (f.args?.value ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
    env: Object.fromEntries(parseLines(f.env?.value, "=")),
    url: f.url?.value ?? "",
    headers: Object.fromEntries(parseLines(f.headers?.value, ":")),
  };
  const r = await window.managerApi.mcpAdd(server);
  if (!r.ok) { pmMsg(SP.error.replace("{error}", r.error || "?"), true); return; }
  pmMsg(""); pmAddFormOpen = false; pmMarkChanged(); pluginsLoadMcp();
}

async function pluginsLoadMcp() {
  const r = await window.managerApi.mcpList();
  if (!r.ok) { pmMsg(SP.error.replace("{error}", r.error || "?"), true); pmLastMcp = []; }
  else pmLastMcp = r.items;
  pmRenderMcp();
}

$("pmPaneMcp").addEventListener("click", async (e) => {
  const off = e.target.closest("button[data-mcponoff]");
  if (off) {
    const [id, serverName, disable] = off.dataset.mcponoff.split("|");
    const r = await window.managerApi.mcpToggle(id, serverName, disable === "1");
    if (!r.ok) { pmMsg(SP.error.replace("{error}", r.error || "?"), true); return; }
    pmMsg(""); pmMarkChanged(); pluginsLoadMcp();
    return;
  }
  const del = e.target.closest("button[data-mcpdel]");
  if (del) {
    const r = await window.managerApi.mcpRemove(del.dataset.mcpdel);
    if (!r.ok && r.pluginProvided) { pmMsg(SP.pluginProvidedMsg); pmMarkChanged(); pluginsLoadMcp(); return; }
    if (!r.ok) { pmMsg(SP.error.replace("{error}", r.error || "?"), true); return; }
    pmMsg(""); pmMarkChanged(); pluginsLoadMcp();
    return;
  }
  const cancel = e.target.closest("#mcpCancel");
  if (cancel) { pmAddFormOpen = false; pmRenderMcp(); }
});

$("pmPaneMcp").addEventListener("change", (e) => {
  if (e.target.name !== "transport") return;
  const form = e.target.closest("form");
  form.querySelector('[data-mode="stdio"]').style.display = e.target.value === "stdio" ? "" : "none";
  form.querySelector('[data-mode="streamable-http"]').style.display = e.target.value === "streamable-http" ? "" : "none";
});

async function pluginsLoadSkills() {
  const pane = $("pmPaneSkills");
  const r = await window.managerApi.skillsList();
  const rows = (r.items || []).map((s) => `<div class="row">
      <div class="body">
        <div class="t"><code>${esc(s.name)}</code>${s.modelInvocable ? `<span class="tag ok">${esc(SP.skillInvocable)}</span>` : ""}</div>
        <div class="m" style="white-space:normal; font-family:inherit;">${esc(s.description)}${s.whenToUse ? " · " + esc(s.whenToUse) : ""}</div>
      </div>
    </div>`).join("");
  pane.innerHTML = `
    <div style="display:flex; gap:8px; margin-bottom:10px;">
      <button class="act" id="skillsOpen">${esc(SP.skillsOpenDir)}</button>
    </div>
    ${rows || `<div class="empty">${esc(SP.skillsEmpty)}</div>`}`;
  $("skillsOpen").addEventListener("click", () => window.managerApi.skillsOpenDir());
}

function pluginsClearProgress() {
  const p = $("progress");
  p.innerHTML = "";
  p.hidden = true;
}

async function pluginsLoad() {
  pmMsg("");
  pluginsClearProgress();
  if (pmTab === "plugins") await pluginsLoadPlugins();
  else if (pmTab === "mcp") await pluginsLoadMcp();
  else await pluginsLoadSkills();
}

window.managerApi.onProgress((line) => {
  if (!line) return;
  const p = $("progress");
  p.hidden = false;
  const div = document.createElement("div");
  div.textContent = line;
  p.appendChild(div);
  while (p.childElementCount > 8) p.removeChild(p.firstChild);
  p.scrollTop = p.scrollHeight;
});

INIT.plugins = pluginsLoad;

// ============================= 用量 =============================

$("usageRefresh").textContent = SU.refresh;
$("usageFootnote").textContent = SU.footnote;
$("liveText").textContent = SU.live;

let usageSessions = [];
let usageSelected = null;
let usageData = null; // tokenUsage
let usagePressure = null;

function usageFmtTokens(n) {
  n = Number.isFinite(n) && n > 0 ? n : 0;
  if (n < 1000) return String(Math.round(n));
  const units = [[1e9, "B"], [1e6, "M"], [1e3, "K"]];
  for (const [size, suffix] of units) {
    if (n >= size) {
      const v = n / size;
      return (v >= 100 ? v.toFixed(0) : v.toFixed(1)) + suffix;
    }
  }
  return String(n);
}
function usageHitRate(u) {
  if (!u) return null;
  const input = u.cacheReadTokens + u.cacheWriteTokens + u.uncachedInputTokens;
  return input > 0 ? u.cacheReadTokens / input : null;
}
function usagePct(x) {
  return (x * 100).toFixed(x >= 0.995 ? 0 : 1) + "%";
}
function usageParseUsage(v) {
  if (!v || typeof v !== "object") return null;
  const o = v;
  const out = { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  for (const k of Object.keys(out)) {
    if (typeof o[k] !== "number" || !Number.isFinite(o[k]) || o[k] < 0) return null;
    out[k] = o[k];
  }
  return out;
}
function usageParsePressure(v) {
  if (!v || typeof v !== "object") return null;
  const used = typeof v.projectedTokens === "number" ? v.projectedTokens
    : typeof v.pressureTokens === "number" ? v.pressureTokens : undefined;
  const win = typeof v.contextWindow === "number" ? v.contextWindow : undefined;
  return used === undefined && win === undefined ? null : { used, win };
}

const USAGE_RING_R = 56;
const USAGE_RING_C = 2 * Math.PI * USAGE_RING_R;

function usageRender() {
  const body = $("usageBody");
  const row = usageSessions.find((s) => s.sessionId === usageSelected);
  $("live").style.display = row?.running ? "inline-flex" : "none";
  if (!row) {
    body.innerHTML = `<div class="empty">${esc(SU.noSessions)}</div>`;
    return;
  }
  if (!usageData && !row.usage) {
    body.innerHTML = `<div class="empty">${esc(SU.noUsage)}</div>`;
    return;
  }
  const u = usageData ?? row.usage ?? { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const p = usagePressure ?? row.pressure ?? null;
  const rate = usageHitRate(u);
  const rateFrac = rate === null ? 0 : Math.min(1, Math.max(0, rate));
  const dash = USAGE_RING_C * (1 - rateFrac);

  const ctxPct = p && p.used !== undefined && p.win ? Math.min(1, p.used / p.win) : null;
  const ctxText = p && p.used !== undefined
    ? (p.win ? SU.contextOf.replace("{used}", usageFmtTokens(p.used)).replace("{win}", usageFmtTokens(p.win))
             : SU.contextUnknown.replace("{used}", usageFmtTokens(p.used)))
    : "—";
  const ctxFill = ctxPct === null ? 0 : Math.round(ctxPct * 100);
  const ctxWarn = ctxPct !== null && ctxPct >= 0.8;

  const input = u.cacheReadTokens + u.cacheWriteTokens + u.uncachedInputTokens;
  const total = input + u.outputTokens;
  const share = (x) => (total > 0 ? Math.round((x / total) * 100) : 0);
  const inputShare = (x) => (input > 0 ? (x / input) : 0);

  body.innerHTML = `
  <div class="hero">
    <div class="ringcard">
      <div class="ring">
        <svg width="132" height="132" viewBox="0 0 132 132">
          <circle class="track" cx="66" cy="66" r="${USAGE_RING_R}" fill="none" stroke-width="11"/>
          <circle class="arc" cx="66" cy="66" r="${USAGE_RING_R}" fill="none" stroke-width="11"
                  stroke-linecap="round" stroke-dasharray="${USAGE_RING_C}" stroke-dashoffset="${USAGE_RING_C}"/>
        </svg>
        <div class="val"><b>${rate === null ? "—" : usagePct(rate)}</b><span>${rate === null ? esc(SU.noHit) : ""}</span></div>
      </div>
      <div class="sub">${esc(SU.hitRate)} · ${esc(SU.hitRateHint)}</div>
    </div>
    <div class="ctx">
      <div class="label"><span>${esc(SU.context)}</span><b>${esc(ctxText)}</b></div>
      <div class="bar${ctxWarn ? " warn" : ""}"><i style="width:${ctxFill}%"></i></div>
      <div class="legend">${esc(SU.contextLegend)}</div>
    </div>
  </div>
  <div class="cards">
    ${usageCard(SU.cacheRead, usageFmtTokens(u.cacheReadTokens), share(u.cacheReadTokens), "var(--hit)")}
    ${usageCard(SU.uncached, usageFmtTokens(u.uncachedInputTokens), share(u.uncachedInputTokens), "var(--miss)")}
    ${usageCard(SU.cacheWrite, usageFmtTokens(u.cacheWriteTokens), share(u.cacheWriteTokens), "var(--write)")}
    ${usageCard(SU.output, usageFmtTokens(u.outputTokens), share(u.outputTokens), "var(--out)")}
  </div>
  <div class="comp">
    <div class="label">${esc(SU.composition)}${input > 0 ? "" : " · " + esc(SU.emptyBar)}</div>
    <div class="stack">
      <i style="width:${(inputShare(u.cacheReadTokens) * 100).toFixed(2)}%;background:var(--hit)"></i><i style="width:${(inputShare(u.cacheWriteTokens) * 100).toFixed(2)}%;background:var(--write)"></i><i style="width:${(inputShare(u.uncachedInputTokens) * 100).toFixed(2)}%;background:var(--miss)"></i>
    </div>
    <div class="legend">
      <em><i style="background:var(--hit)"></i>${esc(SU.cacheRead)} <b>${input > 0 ? usagePct(inputShare(u.cacheReadTokens)) : "—"}</b></em>
      <em><i style="background:var(--write)"></i>${esc(SU.cacheWrite)} <b>${input > 0 ? usagePct(inputShare(u.cacheWriteTokens)) : "—"}</b></em>
      <em><i style="background:var(--miss)"></i>${esc(SU.uncached)} <b>${input > 0 ? usagePct(inputShare(u.uncachedInputTokens)) : "—"}</b></em>
    </div>
  </div>`;

  const arc = body.querySelector(".arc");
  requestAnimationFrame(() => requestAnimationFrame(() => {
    arc.style.strokeDashoffset = String(dash);
  }));
}

function usageCard(label, value, sharePct, color) {
  return `<div class="card">
    <div class="k"><i style="background:${color}"></i>${esc(label)}</div>
    <div class="v">${esc(value)}</div>
    <div class="m"><i style="width:${sharePct}%;background:${color}"></i></div>
  </div>`;
}

function usageFillSelect() {
  const sel = $("session");
  sel.textContent = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = SU.pickSession;
  sel.append(placeholder);
  for (const s of usageSessions) {
    const opt = document.createElement("option");
    opt.value = s.sessionId;
    const label = (s.title || SU.pickSession).slice(0, 40);
    opt.textContent = s.running ? `● ${label}` : label;
    sel.append(opt);
  }
  sel.value = usageSelected ?? "";
}

async function usageLoad() {
  const r = await window.usageApi.snapshot();
  if (!r.ok) return;
  usageSessions = r.items.filter((s) => !s.blank);
  if (!usageSessions.find((s) => s.sessionId === usageSelected)) {
    const running = usageSessions.find((s) => s.running && s.usage);
    const withUsage = usageSessions.find((s) => s.usage);
    usageSelected = (running ?? withUsage ?? usageSessions[0])?.sessionId ?? null;
  }
  const row = usageSessions.find((s) => s.sessionId === usageSelected);
  usageData = row?.usage ? { ...row.usage } : null;
  usagePressure = row?.pressure ? { ...row.pressure } : null;
  usageFillSelect();
  usageRender();
  await window.usageApi.watch(usageSelected);
}

$("session").addEventListener("change", async (e) => {
  usageSelected = e.target.value || null;
  const row = usageSessions.find((s) => s.sessionId === usageSelected);
  usageData = row?.usage ? { ...row.usage } : null;
  usagePressure = row?.pressure ? { ...row.pressure } : null;
  await window.usageApi.watch(usageSelected);
  usageRender();
});
$("usageRefresh").addEventListener("click", usageLoad);

window.usageApi.onUpdate((u) => {
  if (u.sessionId !== usageSelected) return;
  if (u.key === "tokenUsage") usageData = usageParseUsage(u.value) ?? usageData;
  if (u.key === "contextPressure") usagePressure = usageParsePressure(u.value) ?? usagePressure;
  usageRender();
});

INIT.usage = usageLoad;

// ============================= 会话管理 =============================

$("svQ").placeholder = SV.searchPlaceholder;
$("svRefresh").textContent = SV.refresh;
$("svLblBlank").textContent = SV.showBlank;
$("svFooter").textContent = SV.footer;

let svRows = [];

function svMsg(text, cls) {
  const m = $("svMsg");
  m.className = "msg" + (cls ? " " + cls : "");
  m.textContent = text || "";
}
function svRelTime(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return SV.timeNow;
  const m = Math.floor(s / 60);
  if (m < 60) return SV.timeMin.replace("{n}", m);
  const h = Math.floor(m / 60);
  if (h < 24) return SV.timeHour.replace("{n}", h);
  return SV.timeDay.replace("{n}", Math.floor(h / 24));
}
function svUsageBits(row) {
  if (!row.usage) return [];
  const u = row.usage;
  const total = u.cacheReadTokens + u.cacheWriteTokens + u.uncachedInputTokens + u.outputTokens;
  const input = u.cacheReadTokens + u.cacheWriteTokens + u.uncachedInputTokens;
  const hit = input > 0 ? "缓存 " + Math.round((u.cacheReadTokens / input) * 100) + "%" : null;
  const out = [usageFmtTokens(total) + " tok"];
  if (hit) out.push(hit);
  return out;
}
function svRowEl(row) {
  const div = document.createElement("div");
  div.className = "row";
  const body = document.createElement("div");
  body.className = "body";
  const t = document.createElement("div");
  t.className = "t";
  t.textContent = row.title || SV.untitled;
  const m = document.createElement("div");
  m.className = "m";
  const bits = [svRelTime(row.updatedAt)];
  if (row.cwd) bits.push(row.cwd);
  bits.push(...svUsageBits(row));
  m.textContent = bits.join(" · ");
  body.append(t, m);
  div.append(body);
  if (row.running) {
    const badge = document.createElement("span");
    badge.className = "badge running";
    badge.textContent = SV.running;
    div.append(badge);
  }
  const btn = document.createElement("button");
  btn.textContent = SV.export;
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    svMsg("");
    const r = await window.sessionsApi.export(row.sessionId);
    btn.disabled = false;
    if (r.ok) svMsg(SV.exportDone.replace("{path}", r.path), "ok");
    else if (!r.cancelled) svMsg(SV.error.replace("{error}", r.error || "?"), "err");
  });
  div.append(btn);
  return div;
}
function svRenderList(rows) {
  const list = $("svList");
  list.textContent = "";
  if (rows.length === 0) {
    const d = document.createElement("div");
    d.className = "empty";
    d.textContent = SV.empty;
    list.append(d);
    return;
  }
  for (const row of rows) list.append(svRowEl(row));
}
function svApplyFilter() {
  svRenderList($("svShowBlank").checked ? svRows : svRows.filter((x) => !x.blank));
}
async function sessionsLoad() {
  svMsg("");
  const r = await window.sessionsApi.list();
  if (!r.ok) {
    svMsg(SV.error.replace("{error}", r.error || "?"), "err");
    return;
  }
  svRows = r.items;
  svApplyFilter();
}
$("svShowBlank").addEventListener("change", svApplyFilter);
$("svRefresh").addEventListener("click", sessionsLoad);
let svSearchTimer = null;
$("svQ").addEventListener("input", (e) => {
  const q = e.target.value.trim();
  clearTimeout(svSearchTimer);
  if (q === "") {
    svApplyFilter();
    return;
  }
  svSearchTimer = setTimeout(async () => {
    svMsg("");
    const r = await window.sessionsApi.search(q);
    if (!r.ok) {
      svMsg(SV.error.replace("{error}", r.error || "?"), "err");
      return;
    }
    const byId = new Map(svRows.map((x) => [x.sessionId, x]));
    const rows = r.items.map((hit) => {
      const base = byId.get(hit.sessionId);
      return base ?? { sessionId: hit.sessionId, title: "", running: false, blank: false, cwd: undefined, agentPreset: undefined, updatedAt: 0 };
    });
    svRenderList(rows);
    if (r.hasMore) svMsg(SV.searchMore);
  }, 300);
});

INIT.sessions = sessionsLoad;

// --- boot --------------------------------------------------------------------

showTab(INITIAL_TAB);
