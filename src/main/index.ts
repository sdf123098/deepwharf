import { app, BrowserWindow, dialog, globalShortcut, Notification, shell, ipcMain, Menu, nativeTheme } from "electron";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, truncateSync } from "node:fs";
import { join } from "node:path";
import { HarnessProcessManager, type HarnessExitInfo } from "./harness-process";
import { findFreePort } from "./port";
import { resolvePaths, type ResolvedPaths } from "./paths";
import { Logger } from "./log";
import {
  createMainWindow,
  createSplashWindow,
  createSettingsWindow,
  setSplashStatus,
  setSplashVersion,
  openExternalFromWebContents,
  applyTitleBarOverlay,
} from "./window";
import {
  checkForUpdate,
  installHarnessUpdate,
  currentHarnessVersion,
  type HarnessUpdateTransaction,
} from "./harness-update";
import { semverGt, parseDeepLink } from "./pure";
import { t, localeForRenderer } from "./i18n";
import { openPluginStore, registerPluginStoreIpc, setStoreLogSink, type PluginStoreContext } from "./plugin-store";
import { readSettings, writeSettings, updateSettings, sanitizeSettingsPatch } from "./settings";
import { registerHarnessSettingsIpc, harnessRpc } from "./harness-settings";
import { TrayManager } from "./tray";
import { HarnessEventWatcher } from "./harness-events";
import {
  fetchCredentialStatus,
  openOnboardingWindow,
  registerOnboardingIpc,
  shouldAutoOpenOnboarding,
} from "./onboarding";
import { normalizeSessions, registerSessionsIpc, type SessionRow } from "./sessions-browser";
import { registerUsageIpc, notifyUsageProjection } from "./usage-panel";
import { registerPluginManagerIpc } from "./plugin-manager";
import { openLogViewerWindow, registerLogViewerIpc } from "./log-viewer";
import { broadcastTheme, themeSourceFor } from "./theme";
import { fontsCss, installFontProtocol } from "./fonts";
import { setSettingsPageSender } from "./settings-page";
import { ensureCompanion } from "./companion";
import {
  handleWebuiLoaded,
  handleWebuiSnapshot,
  initWebuiTheme,
  requestWebuiFontSync,
  requestWebuiThemeSync,
} from "./webui-theme";
import {
  applyPetSettings,
  hidePet,
  initPet,
  notifyPetEvent,
  notifyPetProjection,
  notifyPetSessionRemoved,
  petWindowExists,
  primePetUsage,
  showPet,
} from "./pet";
import { addApproval, addQuestion, remoteRunning, resolveApproval, startRemote, stopRemote } from "./remote";

let splash: BrowserWindow | null = null;
let mainWindow: BrowserWindow | null = null;
let harness: HarnessProcessManager | null = null;
let tray: TrayManager | null = null;
const events = new HarnessEventWatcher();
let log: Logger;
let paths: ResolvedPaths;
let quitting = false;
let cleanedUp = false;
let currentHarnessPort = 0;
/** True while an update transaction owns the harness — crash UI is suppressed. */
let suppressCrashDialog = false;

function setStatus(status: string, detail = ""): void {
  if (splash) setSplashStatus(splash, status, detail);
}

// --- desktop integration (tray / hotkey / login item) ------------------------

const GLOBAL_HOTKEY = "Control+Alt+D";

/** Tray icon inside the ASAR (packaged) or the repo (dev). */
function trayIconPath(): string {
  return join(__dirname, "..", "..", "build", "icon.ico");
}

/** Restore + focus the main window from any state (hidden, minimized, tray). */
function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function applyGlobalShortcut(): void {
  globalShortcut.unregister(GLOBAL_HOTKEY);
  if (!readSettings().globalShortcutEnabled) return;
  const ok = globalShortcut.register(GLOBAL_HOTKEY, showMainWindow);
  if (!ok) log.log(`global hotkey ${GLOBAL_HOTKEY} unavailable (taken by another app)`);
}

/** Mirror the auto-launch setting into the OS (registry Run key). */
function applyAutoLaunch(): void {
  if (!app.isPackaged) return; // dev would register electron.exe instead of DeepWharf
  try {
    app.setLoginItemSettings({ openAtLogin: readSettings().autoLaunch });
  } catch (err) {
    log.log("setLoginItemSettings failed:", String(err));
  }
}

// --- harness event notifications ----------------------------------------------

/** Subagent child sessions: chatty status churn, never user-facing. */
const childSessions = new Set<string>();
/** Last known running state per session; a true→false edge means "finished". */
const runningBySession = new Map<string, boolean>();

/** Sidebar session rows (non-subagent, non-blank, non-archived); pushed to the
 * shell page on change. Mirrors what the web UI's own sidebar would show. */
let sidebarSessions: SessionRow[] = [];
let sidebarWorkspaces: unknown[] = [];
let archivedSessionIds = new Set<string>();

async function refreshArchived(): Promise<void> {
  try {
    const w = (await harnessRpc(currentHarnessPort, "workspace.list", {})) as {
      archivedSessionIds?: unknown;
      items?: unknown;
    };
    archivedSessionIds = new Set(
      Array.isArray(w?.archivedSessionIds)
        ? w.archivedSessionIds.filter((x): x is string => typeof x === "string")
        : [],
    );
    if (Array.isArray(w?.items)) sidebarWorkspaces = w.items;
  } catch {
    // harness down — keep the last set
  }
}

function pushSidebarSessions(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("shell:sessions", {
      sessions: sidebarSessions,
      workspaces: sidebarWorkspaces,
    });
  }
}

async function refreshSidebarSessions(): Promise<void> {
  await refreshArchived();
  try {
    sidebarSessions = normalizeSessions(await harnessRpc(currentHarnessPort, "session.list", {})).filter(
      (s) => !s.blank && !archivedSessionIds.has(s.sessionId),
    );
  } catch {
    // harness down — keep the last list
  }
  pushSidebarSessions();
}

let sidebarRefreshTimer: NodeJS.Timeout | null = null;
function scheduleSidebarRefresh(): void {
  if (sidebarRefreshTimer) clearTimeout(sidebarRefreshTimer);
  sidebarRefreshTimer = setTimeout(() => {
    sidebarRefreshTimer = null;
    void refreshSidebarSessions();
  }, 400);
}

/** Baseline the edge detector with session.list so a finish that races the
 * watcher's connect is not misread as "never ran". */
async function primeSessionBaseline(port: number): Promise<void> {
  runningBySession.clear();
  childSessions.clear();
  try {
    await refreshArchived();
    const value = (await harnessRpc(port, "session.list", {})) as {
      items?: Array<{ sessionId: string; running: boolean; parentSessionId?: string; origin?: string }>;
    };
    for (const it of value?.items ?? []) {
      runningBySession.set(it.sessionId, it.running);
      if (it.parentSessionId !== undefined || it.origin === "subagent") {
        childSessions.add(it.sessionId);
      }
    }
    sidebarSessions = normalizeSessions(value).filter(
      (s) => !s.blank && !archivedSessionIds.has(s.sessionId),
    );
    pushSidebarSessions();
  } catch (err) {
    log.log("session.list baseline failed:", String(err)); // watcher still works, edges start from first frame
  }
}

/** Toast only when the user is not already looking at the app. */
function desktopNotify(title: string, body: string): void {
  if (!readSettings().notificationsEnabled) return;
  if (!Notification.isSupported()) {
    logOnceNotifyUnsupported();
    return;
  }
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isVisible() && mainWindow.isFocused()) return;
  const n = new Notification({ title, body });
  n.on("click", showMainWindow);
  n.show();
}

let notifyUnsupportedLogged = false;
function logOnceNotifyUnsupported(): void {
  if (notifyUnsupportedLogged) return;
  notifyUnsupportedLogged = true;
  log.log("system notifications unsupported on this platform/settings");
}

function onSessionStatus(sessionId: string, running: boolean): void {
  if (childSessions.has(sessionId)) return;
  const was = runningBySession.get(sessionId);
  runningBySession.set(sessionId, running);
  // mirror into the sidebar cache without a full refetch
  const row = sidebarSessions.find((s) => s.sessionId === sessionId);
  if (row && row.running !== running) {
    row.running = running;
    row.updatedAt = Date.now();
    pushSidebarSessions();
  }
  if (was === true && !running) {
    desktopNotify(t("notifyDoneTitle"), t("notifyDoneBody"));
    notifyPetEvent("done");
  }
}

async function startEventWatcher(port: number): Promise<void> {
  events.stop();
  if (quitting) return;
  await primeSessionBaseline(port);
  if (quitting) return;
  events.start(port, {
    onSessionStatus,
    onAgentError: (sessionId, message) => {
      if (childSessions.has(sessionId)) return;
      desktopNotify(t("notifyErrorTitle"), t("notifyErrorBody", { message: message.slice(0, 200) }));
      notifyPetEvent("error");
    },
    onApproval: (sessionId, toolName, details) => {
      if (childSessions.has(sessionId)) return;
      desktopNotify(t("notifyApprovalTitle"), t("notifyApprovalBody", { tool: toolName || "?" }));
      if (details.approvalId) {
        addApproval({
          approvalId: details.approvalId,
          sessionId,
          toolName: toolName || "?",
          callId: details.callId,
          reason: details.reason,
          at: Date.now(),
        });
      }
    },
    onApprovalResolved: (sessionId, approvalId, outcome) => {
      resolveApproval(approvalId, outcome);
    },
    onQuestion: (sessionId, questions) => {
      if (childSessions.has(sessionId)) return;
      const count = questions.length || 1;
      desktopNotify(t("notifyQuestionTitle"), t("notifyQuestionBody", { count }));
      addQuestion({
        key: `${sessionId}:${questions.map((q) => q.id ?? "").join(",")}:${Date.now()}`,
        sessionId,
        questions: questions.map((q) => ({
          id: typeof q.id === "string" ? q.id : "",
          prompt: typeof q.prompt === "string" ? q.prompt : undefined,
          options: Array.isArray(q.options) ? (q.options as string[]) : undefined,
        })),
        at: Date.now(),
      });
    },
    onSessionAdded: (sessionId, isSubagent) => {
      if (isSubagent) childSessions.add(sessionId);
      else scheduleSidebarRefresh();
    },
    onSessionRemoved: (sessionId) => {
      childSessions.delete(sessionId);
      runningBySession.delete(sessionId);
      notifyPetSessionRemoved(sessionId);
      scheduleSidebarRefresh();
    },
    onProjection: (sessionId, key, value) => {
      // token-meter projections feed the usage panel and the pet's sign.
      notifyUsageProjection(sessionId, key, value);
      if (!childSessions.has(sessionId)) {
        notifyPetProjection(sessionId, key, value);
        if (key === "title" && typeof value === "string") {
          const row = sidebarSessions.find((s) => s.sessionId === sessionId);
          if (row && row.title !== value) {
            row.title = value;
            pushSidebarSessions();
          }
        }
      }
    },
  }, (m) => log.log(`events: ${m}`));
}

// --- single instance ------------------------------------------------------

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_e, commandLine: readonly string[]) => {
    const link = extractDeepLink(commandLine);
    if (link) {
      void handleDeepLink(link);
      return;
    }
    showMainWindow();
  });
  // Per-user protocol registration (HKCU, no admin). Dev must not hijack the
  // scheme with an electron.exe entry.
  if (app.isPackaged) {
    app.setAsDefaultProtocolClient("deepwharf");
  }
  app.setAppUserModelId("com.deepwharf.desktop");
  app.whenReady().then(bootstrap);
}

// --- startup ---------------------------------------------------------------

async function bootstrap(): Promise<void> {
  paths = resolvePaths();
  log = new Logger(paths.desktopLog);
  installFontProtocol(); // dsw-font:// serves the bundled HarmonyOS Sans SC
  log.log("=== DeepSeek Harness Desktop starting ===");
  log.log("desktop:", app.getVersion(), "| electron:", process.versions.electron, "| node:", process.versions.node, "| chrome:", process.versions.chrome);
  log.log("os:", `${process.platform} ${process.arch}`);
  log.log("userData:", app.getPath("userData"));
  log.log("DSH_HOME:", paths.dshHome);
  log.log("node:", paths.nodeExecutable, "| harness:", paths.harnessEntry);
  log.log("isPackaged:", app.isPackaged);

  splash = createSplashWindow();
  setSplashVersion(splash, `v${app.getVersion()}`);
  setStatus(t("splashInit"));

  ensureHarnessReady();

  if (!paths.harnessEntry) {
    return fail(t("harnessNotFound"));
  }

  const nodeCheck = spawnSync(paths.nodeExecutable, ["--version"], {
    windowsHide: true,
    encoding: "utf8",
  });
  if (nodeCheck.status !== 0) {
    return fail(
      t("nodeNotFound", {
        path: paths.nodeExecutable,
        detail: nodeCheck.stderr?.trim() ?? "",
      }),
    );
  }
  log.log("node check:", nodeCheck.stdout.trim());

  registerPluginStoreIpc(
    {
      nodeExecutable: paths.nodeExecutable,
      harnessEntry: paths.harnessEntry,
      dshHome: paths.dshHome,
      log: (m) => log.log(m),
    } satisfies PluginStoreContext,
    onRestartHarness,
  );
  setStoreLogSink((m) => log.log(m));
  registerPluginManagerIpc(
    {
      nodeExecutable: paths.nodeExecutable,
      harnessEntry: paths.harnessEntry,
      dshHome: paths.dshHome,
      log: (m) => log.log(m),
    } satisfies PluginStoreContext,
    () => currentHarnessPort,
    onRestartHarness,
  );

  registerHarnessSettingsIpc(
    {
      getPort: () => currentHarnessPort,
      log: (m) => log.log(m),
    },
    onRestartHarness,
  );

  registerOnboardingIpc(() => currentHarnessPort, (m) => log.log(m));
  registerSessionsIpc(() => currentHarnessPort, (m) => log.log(m));
  registerUsageIpc(() => currentHarnessPort, (m) => log.log(m));
  registerLogViewerIpc({
    desktopLog: paths.desktopLog,
    harnessLog: paths.harnessLog,
    logsDir: paths.logsDir,
    log: (m) => log.log(m),
  });

  // Frameless sub-windows drive their own chrome (resources/chrome.js).
  ipcMain.on("window:close", (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close();
  });
  ipcMain.on("window:minimize", (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize();
  });

  // Remote control server (opt-in via settings; harness stays loopback-only).
  startRemote(() => currentHarnessPort, (m) => log.log(m));

  // Companion plugin (shell themes for the web UI + the usage line): install
  // before the first harness start so it is loaded right away; later changes
  // (shell upgrades) take effect on the next harness start.
  const companion = ensureCompanion({
    nodeExecutable: paths.nodeExecutable,
    harnessEntry: paths.harnessEntry,
    dshHome: paths.dshHome,
    log: (m) => log.log(m),
  });
  if (companion.changed) log.log("companion updated — activates on the next harness start");
  if (!companion.installed) log.log(`companion unavailable: ${companion.reason ?? "?"}`);

  // Web UI theme bridge + desktop pet wiring.
  initWebuiTheme({
    getPort: () => currentHarnessPort,
    log: (m) => log.log(m),
    sendCommand: (cmd) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("shell:webui-command", cmd);
      }
    },
  });
  initPet({
    showMain: showMainWindow,
    log: (m) => log.log(m),
    getMainBounds: () => {
      if (mainWindow && !mainWindow.isDestroyed()) return mainWindow.getNormalBounds();
      return { x: 0, y: 0, width: 0, height: 0 };
    },
    // Keep the tray menu's pet item honest when the pet is hidden/closed
    // (right-click hide, settings toggle) without waiting for a re-sync.
    onPetVisibleChange: (visible) => tray?.setPetVisible(visible),
  });

  Menu.setApplicationMenu(null); // shell UI lives in the custom title bar
  applyTheme();
  // "auto" theme: an OS light/dark flip must reach every open window too.
  nativeTheme.on("updated", () => {
    if (readSettings().theme === "auto") broadcastTheme();
  });
  registerShellIpc();
  await launch();
}

/**
 * Apply the theme: pin nativeTheme to the palette's base mode (the embedded
 * Harness web UI follows it), then push the palette to every window and
 * refresh the title-bar overlay (same-mode changes fire no nativeTheme event).
 * Web UI theme pushes happen only on explicit user changes (settings:set) —
 * never here, so startup never clobbers the web UI's own persisted pick.
 */
function applyTheme(): void {
  nativeTheme.themeSource = themeSourceFor(readSettings().theme);
  broadcastTheme();
  if (mainWindow && !mainWindow.isDestroyed()) applyTitleBarOverlay(mainWindow);
}

/** Pet toggle entry point: honor the settings, then mirror state in the tray. */
function syncPet(): void {
  applyPetSettings();
  tray?.setPetVisible(petWindowExists());
}

/**
 * First run: the installer ships a single harness.zip; extract it into
 * resources/harness so the vendored runtime is present. Keeps the installer fast.
 */
function ensureHarnessReady(): void {
  if (!app.isPackaged) return; // dev uses the npx cache
  const harnessRoot = join(process.resourcesPath, "harness");
  const entry = join(harnessRoot, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
  if (existsSync(entry)) return;
  const zip = join(process.resourcesPath, "harness.zip");
  if (!existsSync(zip)) return;
  setStatus(t("splashPreparing"));
  log.log("first run: extracting harness.zip …");
  mkdirSync(harnessRoot, { recursive: true });
  const r = spawnSync("C:\\Windows\\System32\\tar.exe", ["-xf", zip, "-C", harnessRoot], {
    windowsHide: true,
  });
  log.log("harness extraction exit:", r.status);
}

/** Allocate a port, spawn the harness, wait for it to be ready. */
async function startHarness(): Promise<number> {
  events.stop(); // any previous stream pair belongs to a dead port
  const port = await findFreePort();
  log.log("allocated port:", port);
  setStatus(t("splashStartHarness"));

  harness = new HarnessProcessManager();
  harness.on("exit", (info: HarnessExitInfo) => onHarnessExit(info));
  harness.start({
    nodeExecutable: paths.nodeExecutable,
    harnessEntry: paths.harnessEntry,
    port,
    dshHome: paths.dshHome,
    harnessLog: paths.harnessLog,
  });

  await harness.waitForReady();
  currentHarnessPort = port;
  log.log("harness ready on port", port);
  void startEventWatcher(port);
  void primePetUsage(port); // baseline the pet's usage sign
  return port;
}

/**
 * Full start sequence: harness ready -> main window. Only used for first run;
 * harness restarts must go through restartHarnessInPlace() so the shell stays up.
 */
async function launch(): Promise<void> {
  try {
    const port = await startHarness();
    setStatus(t("splashReady"));

    const win = createMainWindow(port, localeForRenderer());
    mainWindow = win;
    win.on("closed", () => {
      if (mainWindow === win) mainWindow = null;
    });

    // With the tray up, closing the window hides it instead of quitting: the
    // harness process (and every running session) survives until an explicit
    // quit from the tray. Without a tray we must not hide — the window would
    // be unreachable.
    win.on("close", (event) => {
      if (quitting || !tray?.available || !readSettings().closeToTray) return;
      event.preventDefault();
      win.hide();
      tray.notifyHiddenOnce();
    });

    // Desktop integration comes up only after the main window exists.
    tray = new TrayManager(showMainWindow, () => app.quit(), () => {
      // The tray item toggles the pet window itself — not the petEnabled
      // setting. Otherwise right-click-hiding the pet (which leaves the
      // setting on) would make the first click just flip the setting off
      // and the pet would need a second click to come back. Showing also
      // re-enables the feature if settings had it switched off.
      if (petWindowExists()) {
        hidePet();
      } else {
        if (!readSettings().petEnabled) updateSettings({ petEnabled: true });
        showPet();
      }
    });
    try {
      tray.create(trayIconPath(), {
        tooltip: t("trayTooltip"),
        showLabel: t("trayShow"),
        quitLabel: t("btnQuit"),
        balloonTitle: t("trayBalloonTitle"),
        balloonBody: t("trayBalloonBody"),
        petShowLabel: t("petTrayShow"),
        petHideLabel: t("petTrayHide"),
      });
    } catch (err) {
      log.log("tray unavailable, close = quit:", String(err));
      tray = null;
    }
    applyGlobalShortcut();
    applyAutoLaunch();
    syncPet(); // pet window comes up with the shell (when enabled)

    // The shell page is local and fixed; any <webview> attached to it must be
    // locked to our own harness server. The guest gets ONLY our bundled
    // preload (the companion bridge) — never one the page or a plugin chose.
    win.webContents.on("will-attach-webview", (_e, webPreferences, params) => {
      webPreferences.preload = join(__dirname, "..", "..", "resources", "webui-preload.js");
      webPreferences.nodeIntegration = false;
      webPreferences.contextIsolation = true;
      webPreferences.sandbox = true;
      let u: URL;
      try {
        u = new URL(params.src);
      } catch {
        _e.preventDefault();
        return;
      }
      const allowed =
        u.protocol === "http:" &&
        u.hostname === "127.0.0.1" &&
        Number(u.port) === currentHarnessPort;
      if (!allowed) _e.preventDefault();
    });

    // External links from the embedded Harness webview open in the browser, and
    // the guest's main document stays on our own harness server.
    win.webContents.on("did-attach-webview", (_e, guest) => {
      openExternalFromWebContents(guest);
      // Guest console diagnostics (warnings/errors) surface in the desktop log.
      guest.on("console-message", (_ce, level, message) => {
        if (level >= 2) log.log(`webview: ${message}`);
      });
      // The companion reintroduces itself per load; a fresh snapshot generation
      // is what replays stored extra/third-party theme selections.
      guest.on("dom-ready", () => {
        handleWebuiLoaded();
        // Bundled font faces (dsw-font://) must be declared in the guest too —
        // the web UI's own stylesheets cannot see our resources.
        const css = fontsCss();
        if (css) guest.insertCSS(css).catch(() => {});
      });
      guest.on("will-navigate", (event, url) => {
        let u: URL;
        try {
          u = new URL(url);
        } catch {
          event.preventDefault();
          return;
        }
        const allowed =
          u.protocol === "http:" &&
          u.hostname === "127.0.0.1" &&
          Number(u.port) === currentHarnessPort;
        if (!allowed) {
          event.preventDefault();
          if (u.protocol === "https:") void shell.openExternal(url);
        }
      });
    });

    win.webContents.once("did-finish-load", () => {
      log.log("main window loaded");
      splash?.close();
      splash = null;
      void maybeCheckForUpdate(false);
      void maybeCheckShellUpdate(false);
      void maybeOpenOnboarding();
      // Windows cold-start deep link: the OS launched us with the URL in argv.
      const coldLink = extractDeepLink(process.argv);
      if (coldLink) void handleDeepLink(coldLink);
    });
    if (process.env.DSH_DEVTOOLS || readSettings().devtoolsOnStart) {
      win.webContents.openDevTools({ mode: "detach" });
    }

    // Test hooks: open the plugin store, then quit a few seconds later so the
    // full flow can be verified headlessly.
    if (process.env.DSH_TEST_STORE) {
      setTimeout(
        () => openPluginStore(join(__dirname, "preload-plugin.js"), localeForRenderer()),
        2000,
      );
    }
    if (process.env.DSH_TEST_SETTINGS) {
      setTimeout(() => openSettingsWindow(), 2000);
    }
    if (process.env.DSH_TEST_HARNESS_SETTINGS) {
      setTimeout(() => openSettingsWindow("harness"), 2000);
    }
    if (process.env.DSH_TEST_EXIT) {
      setTimeout(() => app.quit(), 8000);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.log("startup failed:", msg);
    fail(msg, paths.harnessLog);
  }
}

// --- onboarding ----------------------------------------------------------------

let onboardingAutoChecked = false;

/** Once per run: if the harness declares unconfigured credentials and the user
 * never dismissed the wizard, open it over the main window. */
async function maybeOpenOnboarding(): Promise<void> {
  if (onboardingAutoChecked) return;
  onboardingAutoChecked = true;
  if (!shouldAutoOpenOnboarding()) return;
  try {
    const status = await fetchCredentialStatus(currentHarnessPort);
    if (status.ok && status.items.some((c) => !c.configured)) {
      openOnboardingWindow(join(__dirname, "preload-onboarding.js"));
    }
  } catch (err) {
    log.log("onboarding check failed:", String(err));
  }
}

// --- deepwharf:// protocol -----------------------------------------------------

function extractDeepLink(args: readonly string[]): string | null {
  for (const a of args) {
    if (a.startsWith("deepwharf:")) return a;
  }
  return null;
}

/**
 * Show the window (and, for ?prompt=…, offer to create a session and send the
 * prompt through the official RPC). A deep link can originate from any web
 * page, so it is NEVER auto-sent: the user sees the exact prompt first and
 * "Send" is not even the default button.
 */
async function handleDeepLink(url: string): Promise<void> {
  log.log("deep link:", url.slice(0, 200));
  const intent = parseDeepLink(url);
  showMainWindow();
  if (!intent || intent.prompt === undefined) return; // bare "show me" link
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const answer = dialog.showMessageBoxSync(mainWindow, {
    type: "question",
    title: t("deeplinkTitle"),
    message: t("deeplinkMessage"),
    detail: intent.prompt.slice(0, 500) + (intent.prompt.length > 500 ? "…" : ""),
    buttons: [t("deeplinkSend"), t("btnLater")],
    defaultId: 1, // cancel is the safe default for an untrusted origin
  });
  if (answer !== 0) return;

  try {
    const created = (await harnessRpc(currentHarnessPort, "session.create", intent.cwd ? { cwd: intent.cwd } : {})) as {
      sessionId?: unknown;
    };
    const sessionId = typeof created?.sessionId === "string" ? created.sessionId : "";
    if (!sessionId) throw new Error("session.create returned no sessionId");
    await harnessRpc(currentHarnessPort, "session.prompt", {
      sessionId,
      mode: "queue",
      content: [{ type: "text", text: intent.prompt }],
    });
    showMainWindow();
  } catch (err) {
    log.log("deep link send failed:", String(err));
    if (mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox(t("deeplinkTitle"), t("deeplinkFailed", { error: String(err) }));
    }
  }
}

// --- failure / crash handling ----------------------------------------------

function fail(message: string, detail = ""): void {
  log.log("startup failed:", message);
  setStatus(t("splashFailed"), detail ? `${message}\n\nLogs: ${detail}` : message);
}

function onHarnessExit(info: HarnessExitInfo): void {
  log.log("harness exited: code", info.code, "signal", info.signal, "expected", info.expected);
  if (info.expected) return;
  if (quitting || cleanedUp || suppressCrashDialog) return;
  if (!mainWindow || mainWindow.isDestroyed()) return; // startup path — waitForReady() throws and fail() shows the error
  // The window may be hidden in the tray; a crash dialog nobody can see is a hang.
  showMainWindow();

  const choice = dialog.showMessageBoxSync(mainWindow, {
    type: "error",
    title: t("crashTitle"),
    message: t("crashMessage"),
    detail: t("crashDetail", {
      code: String(info.code ?? "?"),
      log: paths.harnessLog,
    }),
    buttons: [t("btnRestart"), t("btnViewLogs"), t("btnQuit")],
    defaultId: 0,
  });
  if (choice === 0) {
    void restartHarnessInPlace();
  } else if (choice === 1) {
    shell.openPath(paths.harnessLog);
  } else {
    app.quit();
  }
}

/** Stop the harness and start it again on a fresh port, keeping the shell alive. */
async function restartHarnessInPlace(): Promise<void> {
  try {
    if (harness) {
      await harness.stop(); // expected exit — no crash dialog
      harness = null;
    }
    const port = await startHarness();
    updateHarnessPort(port);
  } catch (err) {
    log.log("harness restart failed:", String(err));
    if (mainWindow && !mainWindow.isDestroyed()) {
      dialog.showMessageBox(mainWindow, {
        type: "error",
        title: t("harnessRestartFailed"),
        message: t("harnessRestartFailedDetail", { error: String(err) }),
      });
    }
  }
}

/** Point the shell's <webview> at the new harness port without touching the shell page. */
function updateHarnessPort(port: number): void {
  currentHarnessPort = port;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("shell:harness-port", port);
}

/** Stop and drop the current harness manager (used inside update transactions). */
async function stopHarnessQuietly(): Promise<void> {
  events.stop();
  const mgr = harness;
  harness = null;
  if (mgr) await mgr.stop();
}

// --- harness auto-update ----------------------------------------------------

async function maybeCheckForUpdate(force: boolean): Promise<void> {
  // Only update a bundled harness (one that lives inside the app's own
  // resources). Dev mode runs from the npx cache and must not be touched.
  if (!paths.harnessEntry.startsWith(process.resourcesPath)) return;
  const settings = readSettings();
  if (!force) {
    if (!settings.autoCheckUpdates) return;
    if (Date.now() - settings.lastUpdateCheck < 24 * 3600 * 1000) return;
  }
  settings.lastUpdateCheck = Date.now();
  writeSettings(settings);

  let check;
  try {
    check = await checkForUpdate(paths.harnessEntry);
  } catch (err) {
    log.log("update check failed:", String(err));
    return;
  }
  log.log("update check:", JSON.stringify(check));

  if (!check.updateAvailable) {
    if (force && mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: "info",
        title: t("upToDateTitle"),
        message: t("upToDateMessage", { version: String(check.current ?? "?") }),
      });
    }
    return;
  }

  if (!mainWindow) return;
  const answer = dialog.showMessageBoxSync(mainWindow, {
    type: "info",
    title: t("updateTitle"),
    message: t("updateMessage", { from: String(check.current), to: String(check.latest) }),
    detail: t("updateDetail"),
    buttons: [t("btnUpdateNow"), t("btnLater")],
    defaultId: 0,
  });
  if (answer !== 0) return;
  await applyHarnessUpdate(check.latest!);
}

/**
 * Transactional update: the old version stays on disk until the new one
 * becomes ready; any failure restores the old version and starts it.
 */
async function applyHarnessUpdate(version: string): Promise<void> {
  suppressCrashDialog = true;
  let tx: HarnessUpdateTransaction | null = null;
  try {
    log.log("applying harness update to", version);
    await stopHarnessQuietly();
    tx = await installHarnessUpdate(paths.nodeExecutable, paths.harnessEntry, version, (m) => log.log(m));
    const port = await startHarness(); // new version must become ready first
    tx.commit();
    tx = null;
    updateHarnessPort(port);
    if (mainWindow && !mainWindow.isDestroyed()) {
      dialog.showMessageBox(mainWindow, {
        type: "info",
        title: t("updatedTitle"),
        message: t("updatedMessage", { version }),
      });
    }
  } catch (err) {
    log.log("harness update failed:", String(err));
    try {
      if (tx) {
        // The swap happened but the new version never became ready:
        // restore the previous version before starting anything.
        await stopHarnessQuietly();
        tx.rollback();
        tx = null;
      }
      // Bring the on-disk (old, still-installed, or rolled-back) version back
      // up. If a failure happened after commit the harness is already running
      // (harness !== null) and must not be double-spawned.
      if (!harness) {
        const port = await startHarness();
        updateHarnessPort(port);
      }
    } catch (restartErr) {
      log.log("harness restart after failed update failed:", String(restartErr));
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      dialog.showMessageBox(mainWindow, {
        type: "error",
        title: t("updateFailedTitle"),
        message: t("updateFailedDetail", { error: String(err) }),
      });
    }
  } finally {
    suppressCrashDialog = false;
  }
}

// --- menu -------------------------------------------------------------------

/** Stop the harness and start it again on a fresh port (used by plugin store). */
async function onRestartHarness(): Promise<void> {
  log.log("restarting harness");
  await restartHarnessInPlace();
}

// --- shell / settings IPC ---------------------------------------------------

function bundledNodeVersion(): string {
  try {
    return spawnSync(paths.nodeExecutable, ["--version"], { encoding: "utf8" }).stdout.trim();
  } catch {
    return process.versions.node;
  }
}

/** First non-internal IPv4 on this host (for the remote console URL). */
function lanAddress(): string {
  try {
    const nets = require("node:os").networkInterfaces() as Record<string, Array<{ family: string; address: string; internal: boolean }>>;
    for (const list of Object.values(nets)) {
      for (const n of list ?? []) {
        if (n.family === "IPv4" && !n.internal) return n.address;
      }
    }
  } catch {
    // fall through
  }
  return "127.0.0.1";
}

function getVersions() {
  return {
    desktop: app.getVersion(),
    harness: currentHarnessVersion(paths.harnessEntry),
    node: bundledNodeVersion(),
  };
}

let settingsWindow: BrowserWindow | null = null;
/** Open the merged settings page (shell / harness / plugins / usage tabs). */
function openSettingsWindow(tab = "shell"): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = createSettingsWindow(join(__dirname, "preload-settings.js"), localeForRenderer(), tab);
  // The merged page is the authorized sender for the harness-settings,
  // plugin-manager, and usage IPC surfaces too.
  setSettingsPageSender(settingsWindow.webContents);
  settingsWindow.on("closed", () => {
    if (settingsWindow) setSettingsPageSender(null);
    settingsWindow = null;
  });
}

async function checkShellUpdate(force: boolean): Promise<void> {
  const current = app.getVersion();
  const win = settingsWindow ?? mainWindow;
  const customFeed = process.env.SHELL_UPDATE_URL; // optional JSON { "version": "x.y.z" }
  const repo = process.env.SHELL_UPDATE_REPO || "sdf123098/deepwharf";

  let latest: string | null = null;
  let releaseUrl: string | null = null;
  try {
    if (customFeed) {
      const res = await fetch(customFeed, { signal: AbortSignal.timeout(10000) });
      const meta = (await res.json()) as { version?: string };
      latest = meta.version ?? null;
    } else {
      // Default update source: this project's GitHub Releases.
      const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "DeepWharf" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`github responded ${res.status}`);
      const meta = (await res.json()) as { tag_name?: string; html_url?: string };
      latest = (meta.tag_name ?? "").replace(/^v/i, "") || null;
      releaseUrl = meta.html_url ?? null;
    }
  } catch (err) {
    log.log("shell update check failed:", String(err));
  }

  if (!win) return;
  if (latest && semverGt(latest, current)) {
    const buttons = releaseUrl ? [t("btnDownload"), t("btnLater")] : [t("btnLater")];
    const { response } = await dialog.showMessageBox(win, {
      type: "info",
      title: t("updateTitle"),
      message: t("shellUpdateAvailable", { from: current, to: latest }),
      buttons,
      defaultId: 0,
    });
    if (response === 0 && releaseUrl) void shell.openExternal(releaseUrl);
  } else if (force) {
    dialog.showMessageBox(win, {
      type: "info",
      title: t("upToDateTitle"),
      message: t("shellUpToDate", { version: current }),
    });
  }
}

async function maybeCheckShellUpdate(force: boolean): Promise<void> {
  const settings = readSettings();
  if (!force) {
    if (!settings.autoCheckShell) return;
    if (Date.now() - settings.lastShellCheck < 24 * 3600 * 1000) return;
  }
  updateSettings({ lastShellCheck: Date.now() });
  await checkShellUpdate(force);
}

function assertShellSender(event: Electron.IpcMainInvokeEvent): void {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
    throw new Error("unauthorized IPC sender");
  }
}

function assertSettingsSender(event: Electron.IpcMainInvokeEvent): void {
  if (!settingsWindow || settingsWindow.isDestroyed() || event.sender !== settingsWindow.webContents) {
    throw new Error("unauthorized IPC sender");
  }
}

/** Truncate the desktop/harness logs (and their rotated copies) to zero. */
function clearLogs(): void {
  try {
    for (const entry of readdirSync(paths.logsDir)) {
      if (!entry.startsWith("desktop.log") && !entry.startsWith("harness.log")) continue;
      const p = join(paths.logsDir, entry);
      try {
        rmSync(p, { force: true }); // rotated copies and closed files
      } catch {
        try {
          truncateSync(p, 0); // file still open by a log stream — truncate instead
        } catch {
          // still busy — best effort
        }
      }
    }
  } catch {
    // logs dir missing — nothing to clear
  }
}

function registerShellIpc(): void {
  const lang = () => localeForRenderer();
  // Top-bar shell actions
  ipcMain.handle("shell:locale", (e) => {
    assertShellSender(e);
    return lang();
  });
  ipcMain.handle("shell:openStore", (e) => {
    assertShellSender(e);
    return openPluginStore(join(__dirname, "preload-plugin.js"), lang());
  });
  ipcMain.handle("shell:openSettings", (e) => {
    assertShellSender(e);
    return openSettingsWindow();
  });
  // Session sidebar: cached list + open/new (open routes through the companion
  // bridge so the embedded web UI switches to the session).
  ipcMain.handle("shell:sessions", (e) => {
    assertShellSender(e);
    return sidebarSessions;
  });
  ipcMain.handle("shell:session-open", (e, id: unknown) => {
    assertShellSender(e);
    if (typeof id !== "string" || id === "" || id.length > 200) return { ok: false };
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("shell:webui-command", {
        source: "deepwharf-shell",
        type: "open-session",
        id,
      });
    }
    return { ok: true };
  });
  ipcMain.handle("shell:session-new", async (e, workspaceId: unknown) => {
    assertShellSender(e);
    try {
      const created = (await harnessRpc(
        currentHarnessPort,
        "session.create",
        typeof workspaceId === "string" && workspaceId !== "" ? { workspaceId } : {},
      )) as {
        sessionId?: unknown;
      };
      const sessionId = typeof created?.sessionId === "string" ? created.sessionId : "";
      if (sessionId) await refreshSidebarSessions();
      return sessionId;
    } catch (err) {
      log.log(`session.create failed: ${String(err)}`);
      return "";
    }
  });
  // Open the harness's own settings panel (migrated from the hidden web UI
  // sidebar) via the companion bridge.
  ipcMain.handle("shell:webui-settings", (e) => {
    assertShellSender(e);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("shell:webui-command", {
        source: "deepwharf-shell",
        type: "open-webui-settings",
      });
    }
    return { ok: true };
  });
  // Sidebar management actions (migrated from the web UI sidebar): workspace
  // create/rename/delete, session archive/rename/fork.
  const sidebarAction = async (e: Electron.IpcMainInvokeEvent, method: string, payload: unknown) => {
    assertShellSender(e);
    try {
      const value = await harnessRpc(currentHarnessPort, method, payload);
      await refreshSidebarSessions();
      return { ok: true, value };
    } catch (err) {
      log.log(`${method} failed: ${String(err)}`);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  };
  // Native folder picker for the sidebar's "new workspace" flow — the shell
  // page has no webview-granted file access, so the dialog runs in the main
  // process. The OS dialog title/defaults stay localized out of the box.
  ipcMain.handle("shell:pick-directory", async (e) => {
    assertShellSender(e);
    try {
      const win = BrowserWindow.fromWebContents(e.sender);
      const options: Electron.OpenDialogOptions = {
        properties: ["openDirectory", "createDirectory"],
      };
      const r = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options);
      if (r.canceled || r.filePaths.length === 0) return { ok: false, canceled: true };
      return { ok: true, path: r.filePaths[0] };
    } catch (err) {
      log.log(`pick-directory failed: ${String(err)}`);
      return { ok: false, canceled: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
  ipcMain.handle("shell:workspace-list", async (e) => {
    assertShellSender(e);
    try {
      await refreshArchived();
      return { ok: true, workspaces: sidebarWorkspaces, archived: [...archivedSessionIds] };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
  ipcMain.handle("shell:workspace-create", (e, path: unknown) =>
    sidebarAction(e, "workspace.create", typeof path === "string" ? { path: path.slice(0, 500) } : {}),
  );
  ipcMain.handle("shell:workspace-rename", (e, workspaceId: unknown, title: unknown) =>
    sidebarAction(
      e,
      "workspace.rename",
      typeof workspaceId === "string" && typeof title === "string"
        ? { workspaceId, title: title.slice(0, 200) }
        : {},
    ),
  );
  ipcMain.handle("shell:workspace-delete", (e, workspaceId: unknown) =>
    sidebarAction(e, "workspace.delete", typeof workspaceId === "string" ? { workspaceId } : {}),
  );
  ipcMain.handle("shell:session-archive", (e, sessionId: unknown) =>
    sidebarAction(e, "workspace.archiveSession", typeof sessionId === "string" ? { sessionId } : {}),
  );
  ipcMain.handle("shell:session-rename", (e, sessionId: unknown, title: unknown) =>
    sidebarAction(
      e,
      "session.rename",
      typeof sessionId === "string" && typeof title === "string"
        ? { sessionId, title: title.slice(0, 300) }
        : {},
    ),
  );
  ipcMain.handle("shell:session-fork", (e, sessionId: unknown) =>
    sidebarAction(e, "session.fork", typeof sessionId === "string" ? { sessionId } : {}),
  );
  ipcMain.handle("shell:checkHarness", (e) => {
    assertShellSender(e);
    return maybeCheckForUpdate(true);
  });
  ipcMain.handle("shell:checkShell", (e) => {
    assertShellSender(e);
    return checkShellUpdate(true);
  });
  ipcMain.handle("shell:versions", (e) => {
    assertShellSender(e);
    return getVersions();
  });
  // Companion bridge: snapshots in (already relayed by the embedder page).
  ipcMain.handle("shell:webui-event", (e, payload: unknown) => {
    assertShellSender(e);
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const p = payload as Record<string, unknown>;
      if (p.type === "snapshot") {
        handleWebuiSnapshot(payload);
        applyTheme(); // re-pin nativeTheme / title bar with the fresh palette
      } else if (p.type === "error") {
        log.log(`companion: ${typeof p.message === "string" ? p.message : "unknown error"}`);
      }
    }
    return { ok: true };
  });

  // Settings window
  ipcMain.handle("settings:locale", (e) => {
    assertSettingsSender(e);
    return lang();
  });
  ipcMain.handle("settings:get", (e) => {
    assertSettingsSender(e);
    return readSettings();
  });
  ipcMain.handle("settings:set", (e, patch: unknown) => {
    assertSettingsSender(e);
    const sanitized = sanitizeSettingsPatch(patch);
    const next = updateSettings(sanitized);
    if (sanitized.theme !== undefined) {
      applyTheme();
      requestWebuiThemeSync(); // explicit user change: drive the web UI too
    }
    if (sanitized.fontFamily !== undefined) {
      broadcastTheme(); // theme payload carries the font to every shell window
      requestWebuiFontSync();
    }
    if (sanitized.globalShortcutEnabled !== undefined) applyGlobalShortcut();
    if (sanitized.autoLaunch !== undefined) applyAutoLaunch();
    if (sanitized.petEnabled !== undefined || sanitized.petSignEnabled !== undefined) syncPet();
    if (sanitized.remoteEnabled !== undefined || sanitized.remotePort !== undefined) {
      startRemote(() => currentHarnessPort, (m) => log.log(m));
    }
    return next;
  });
  // Remote control: current status + token management for the settings page.
  ipcMain.handle("settings:remote-info", (e) => {
    assertSettingsSender(e);
    const info = remoteRunning();
    const lan = lanAddress();
    return {
      running: info.running,
      port: info.port,
      token: readSettings().remoteToken,
      url: info.running ? `http://${lan}:${info.port}/` : null,
    };
  });
  ipcMain.handle("settings:remote-token", (e) => {
    assertSettingsSender(e);
    const token = randomBytes(24).toString("base64url");
    updateSettings({ remoteToken: token });
    return token;
  });
  ipcMain.handle("settings:openLogs", (e) => {
    assertSettingsSender(e);
    return shell.openPath(paths.logsDir);
  });
  ipcMain.handle("settings:openLogViewer", (e) => {
    assertSettingsSender(e);
    return openLogViewerWindow(join(__dirname, "preload-log-viewer.js"), {
      desktopLog: paths.desktopLog,
      harnessLog: paths.harnessLog,
      logsDir: paths.logsDir,
      log: (m) => log.log(m),
    });
  });
  ipcMain.handle("settings:clearLogs", (e) => {
    assertSettingsSender(e);
    clearLogs();
    return { ok: true };
  });
  ipcMain.handle("settings:checkHarness", (e) => {
    assertSettingsSender(e);
    return maybeCheckForUpdate(true);
  });
  ipcMain.handle("settings:checkShell", (e) => {
    assertSettingsSender(e);
    return checkShellUpdate(true);
  });
  ipcMain.handle("settings:versions", (e) => {
    assertSettingsSender(e);
    return getVersions();
  });
}

// --- shutdown ---------------------------------------------------------------

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", (event) => {
  if (cleanedUp) return;
  event.preventDefault();
  quitting = true;
  const mgr = harness;
  harness = null;
  const done = () => {
    cleanedUp = true;
    events.stop();
    stopRemote();
    tray?.destroy();
    tray = null;
    globalShortcut.unregisterAll();
    log.log("cleanup done, quitting");
    app.quit();
  };
  if (mgr) {
    mgr.stop().then(done, done);
  } else {
    done();
  }
});

// Last-resort sync tree kill if the main process dies without before-quit.
process.on("exit", () => {
  harness?.killNow();
});
