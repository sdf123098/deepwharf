import { app, BrowserWindow, dialog, shell, ipcMain, Menu, nativeTheme } from "electron";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
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
} from "./window";
import {
  checkForUpdate,
  installHarnessUpdate,
  currentHarnessVersion,
  semverGt,
  type HarnessUpdateTransaction,
} from "./harness-update";
import { t, localeForRenderer } from "./i18n";
import { openPluginStore, registerPluginStoreIpc, type PluginStoreContext } from "./plugin-store";
import { readSettings, writeSettings, updateSettings, sanitizeSettingsPatch, effectiveLanguage } from "./settings";

let splash: BrowserWindow | null = null;
let mainWindow: BrowserWindow | null = null;
let harness: HarnessProcessManager | null = null;
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

// --- single instance ------------------------------------------------------

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.setAppUserModelId("com.deepwharf.desktop");
  app.whenReady().then(bootstrap);
}

// --- startup ---------------------------------------------------------------

async function bootstrap(): Promise<void> {
  paths = resolvePaths();
  log = new Logger(paths.desktopLog);
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

  Menu.setApplicationMenu(null); // shell UI lives in the custom title bar
  applyTheme();
  registerShellIpc();
  await launch();
}

/** Map the saved theme preference onto Electron's native theme source. */
function applyTheme(): void {
  const theme = readSettings().theme;
  nativeTheme.themeSource = theme === "auto" ? "system" : theme;
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

    // The shell page is local and fixed; any <webview> attached to it must be
    // locked to our own harness server (no preload, no node, sandboxed guest).
    win.webContents.on("will-attach-webview", (_e, webPreferences, params) => {
      delete webPreferences.preload;
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
    if (process.env.DSH_TEST_EXIT) {
      setTimeout(() => app.quit(), 8000);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.log("startup failed:", msg);
    fail(msg, paths.harnessLog);
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

function getVersions() {
  return {
    desktop: app.getVersion(),
    harness: currentHarnessVersion(paths.harnessEntry),
    node: bundledNodeVersion(),
  };
}

let settingsWindow: BrowserWindow | null = null;
function openSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = createSettingsWindow(join(__dirname, "preload-settings.js"), localeForRenderer());
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

async function checkShellUpdate(force: boolean): Promise<void> {
  const current = app.getVersion();
  const feed = process.env.SHELL_UPDATE_URL;
  const win = settingsWindow ?? mainWindow;
  if (!feed) {
    if (force && win) {
      dialog.showMessageBox(win, {
        type: "info",
        title: t("upToDateTitle"),
        message: t("shellNoFeed", { version: current }),
      });
    }
    return;
  }
  try {
    const res = await fetch(feed, { signal: AbortSignal.timeout(10000) });
    const meta = (await res.json()) as { version?: string };
    const latest = meta.version;
    if (win) {
      if (latest && semverGt(latest, current)) {
        dialog.showMessageBox(win, {
          type: "info",
          title: t("updateTitle"),
          message: t("shellUpdateAvailable", { from: current, to: latest }),
        });
      } else if (force) {
        dialog.showMessageBox(win, {
          type: "info",
          title: t("upToDateTitle"),
          message: t("shellUpToDate", { version: current }),
        });
      }
    }
  } catch {
    if (force && win) {
      dialog.showMessageBox(win, {
        type: "info",
        title: t("upToDateTitle"),
        message: t("shellNoFeed", { version: current }),
      });
    }
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
    if (sanitized.theme !== undefined) applyTheme();
    return next;
  });
  ipcMain.handle("settings:openLogs", (e) => {
    assertSettingsSender(e);
    return shell.openPath(paths.logsDir);
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
