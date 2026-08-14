import { effectiveLanguage } from "./settings";

// Shell localization: zh-CN / en-US. Everything the wrapper shows — splash,
// menus, dialogs — goes through here so the product feels native in Chinese.
const zhCN = {
  splashStarting: "正在启动…",
  splashInit: "初始化中…",
  splashStartHarness: "正在启动 Harness…",
  splashPreparing: "首次运行，正在准备 Harness…",
  splashReady: "就绪",
  splashFailed: "启动失败",

  menuFile: "文件",
  menuEdit: "编辑",
  menuView: "视图",
  menuHarness: "Harness",
  menuQuit: "退出",
  menuCheckUpdates: "检查更新…",
  menuPluginStore: "插件商店…",
  menuUndo: "撤销",
  menuRedo: "重做",
  menuCut: "剪切",
  menuCopy: "复制",
  menuPaste: "粘贴",
  menuSelectAll: "全选",
  menuReload: "重新加载",
  menuToggleDevTools: "开发者工具",
  menuResetZoom: "实际大小",
  menuZoomIn: "放大",
  menuZoomOut: "缩小",

  harnessNotFound:
    "找不到 DeepSeek Harness (dsh)。\n请先运行一次 `npx @deepseek-ai/dsh web` 让其缓存，或设置 DSH_HARNESS_ENTRY。",
  nodeNotFound: "未找到 Node.js：{path}\n{detail}",

  crashTitle: "Harness 崩溃",
  crashMessage: "DeepSeek Harness 进程意外退出。",
  crashDetail: "退出码：{code}\n\n日志：{log}",
  btnRestart: "重启",
  btnViewLogs: "查看日志",
  btnQuit: "退出",
  btnUpdateNow: "立即更新",
  btnLater: "稍后",
  btnRetry: "重试",

  updateTitle: "Harness 更新可用",
  updateMessage: "发现新的 DeepSeek Harness：{from} → {to}",
  updateDetail: "更新将下载新运行时并重启 Harness。",
  updatedTitle: "已更新",
  updatedMessage: "DeepSeek Harness 已更新到 {version}。",
  updateFailedTitle: "更新失败",
  upToDateTitle: "更新检查",
  upToDateMessage: "DeepSeek Harness 已是最新版本（{version}）。",
  updateFailedDetail: "{error}",

  storeTitle: "插件商店",
  storeSearchPlaceholder: "搜索插件（名称 / 关键词）…",
  storeSearch: "搜索",
  storeInstall: "安装",
  storeInstalling: "安装中…",
  storeInstalled: "已安装",
  storeRestartToActivate: "插件已安装，重启 Harness 后生效。立即重启？",
  storeRestart: "重启",
  storeError: "操作失败：{error}",
  storeEmpty: "没有找到插件。换个关键词试试。",
  storeLoading: "加载中…",
  storePluginsCount: "共 {count} 个插件",
  storeOfficial: "数据源：npm registry（@deepseek-ai 生态，GitHub dsh-plugin 主题）",

  menuSettings: "外壳设置…",
  settingsTitle: "外壳设置",
  settingsAppearance: "外观与行为",
  settingsLanguage: "界面语言",
  langAuto: "跟随系统",
  settingsAutoCheckHarness: "启动时检查 Harness 更新",
  settingsAutoCheckShell: "启动时检查外壳更新",
  settingsDevtools: "启动时打开开发者工具",
  settingsAbout: "关于",
  settingsVersionDesktop: "外壳版本",
  settingsVersionHarness: "Harness 版本",
  settingsVersionNode: "Node 版本",
  settingsOpenLogs: "打开日志目录",
  settingsCheckHarness: "检查 Harness 更新",
  settingsCheckShell: "检查外壳更新",
  shellUpToDate: "外壳已是最新版本（{version}）。",
  shellUpdateAvailable: "发现新外壳版本：{from} → {to}。请重新下载安装包覆盖安装。",
  shellNoFeed: "未配置外壳更新源（SHELL_UPDATE_URL）。当前版本 {version}。",
  settingsSaved: "已保存，部分设置重启后生效。",
  btnClose: "关闭",
};

const enUS: Record<keyof typeof zhCN, string> = {
  splashStarting: "Starting…",
  splashInit: "Initializing…",
  splashStartHarness: "Starting Harness…",
  splashPreparing: "First run — preparing Harness…",
  splashReady: "Ready",
  splashFailed: "Failed to start",

  menuFile: "File",
  menuEdit: "Edit",
  menuView: "View",
  menuHarness: "Harness",
  menuQuit: "Quit",
  menuCheckUpdates: "Check for Updates…",
  menuPluginStore: "Plugin Store…",
  menuUndo: "Undo",
  menuRedo: "Redo",
  menuCut: "Cut",
  menuCopy: "Copy",
  menuPaste: "Paste",
  menuSelectAll: "Select All",
  menuReload: "Reload",
  menuToggleDevTools: "Developer Tools",
  menuResetZoom: "Actual Size",
  menuZoomIn: "Zoom In",
  menuZoomOut: "Zoom Out",

  harnessNotFound:
    "Cannot find DeepSeek Harness (dsh).\nRun `npx @deepseek-ai/dsh web` once so it gets cached, or set DSH_HARNESS_ENTRY.",
  nodeNotFound: "Node.js not found at {path}\n{detail}",

  crashTitle: "Harness crashed",
  crashMessage: "The DeepSeek Harness process exited unexpectedly.",
  crashDetail: "Exit code: {code}\n\nLogs: {log}",
  btnRestart: "Restart",
  btnViewLogs: "View Logs",
  btnQuit: "Quit",
  btnUpdateNow: "Update now",
  btnLater: "Later",
  btnRetry: "Retry",

  updateTitle: "Harness update available",
  updateMessage: "A new DeepSeek Harness is available: {from} → {to}",
  updateDetail: "Updating downloads the new runtime and restarts Harness.",
  updatedTitle: "Updated",
  updatedMessage: "DeepSeek Harness updated to {version}.",
  updateFailedTitle: "Update failed",
  upToDateTitle: "Updates",
  upToDateMessage: "DeepSeek Harness is up to date ({version}).",
  updateFailedDetail: "{error}",

  storeTitle: "Plugin Store",
  storeSearchPlaceholder: "Search plugins (name / keyword)…",
  storeSearch: "Search",
  storeInstall: "Install",
  storeInstalling: "Installing…",
  storeInstalled: "Installed",
  storeRestartToActivate: "Plugin installed. Restart Harness to activate it?",
  storeRestart: "Restart",
  storeError: "Operation failed: {error}",
  storeEmpty: "No plugins found. Try another keyword.",
  storeLoading: "Loading…",
  storePluginsCount: "{count} plugins",
  storeOfficial: "Source: npm registry (DeepSeek Harness plugin ecosystem, GitHub dsh-plugin topic)",

  menuSettings: "Shell Settings…",
  settingsTitle: "Shell Settings",
  settingsAppearance: "Appearance & Behavior",
  settingsLanguage: "Interface language",
  langAuto: "Follow system",
  settingsAutoCheckHarness: "Check for Harness updates on startup",
  settingsAutoCheckShell: "Check for shell updates on startup",
  settingsDevtools: "Open DevTools on startup",
  settingsAbout: "Versions & Updates",
  settingsVersionDesktop: "Shell version",
  settingsVersionHarness: "Harness version",
  settingsVersionNode: "Node version",
  settingsOpenLogs: "Open logs folder",
  settingsCheckHarness: "Check Harness update",
  settingsCheckShell: "Check shell update",
  shellUpToDate: "Shell is up to date ({version}).",
  shellUpdateAvailable: "A new shell version is available: {from} → {to}. Please re-download the installer to update.",
  shellNoFeed: "No shell update feed configured (SHELL_UPDATE_URL). Current version {version}.",
  settingsSaved: "Saved. Some settings apply after a restart.",
  btnClose: "Close",
};

export type I18nKey = keyof typeof zhCN;

const dicts: Record<string, Record<I18nKey, string>> = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

export function shellLocale(): string {
  return effectiveLanguage();
}

export function t(key: I18nKey, vars?: Record<string, string | number>): string {
  const dict = dicts[shellLocale()] ?? enUS;
  let s = dict[key] ?? enUS[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(`{${k}}`, String(v));
    }
  }
  return s;
}

/** Static key lookup without interpolation (for renderer use). */
export function localeForRenderer(): string {
  return shellLocale();
}
