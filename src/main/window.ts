import { BrowserWindow, shell, nativeTheme } from "electron";
import { join } from "node:path";

function overlayColors() {
  return nativeTheme.shouldUseDarkColors
    ? { color: "#0d1117", symbolColor: "#e6edf3" }
    : { color: "#ffffff", symbolColor: "#1a1f28" };
}

export function applyTitleBarOverlay(win: BrowserWindow): void {
  try {
    win.setTitleBarOverlay({ ...overlayColors(), height: 40 });
  } catch {
    // not supported on this platform
  }
}

export function createSplashWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 480,
    height: 300,
    frame: false,
    resizable: false,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0a0e1a" : "#f5f7fb",
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  win.loadFile(join(__dirname, "../../resources/splash.html"));
  win.once("ready-to-show", () => win.show());
  return win;
}

export function setSplashStatus(win: BrowserWindow, status: string, detail = ""): void {
  const js = `(() => {
    const s = document.getElementById('status');
    if (s) s.textContent = ${JSON.stringify(status)};
    const sp = document.getElementById('spinner');
    if (sp) sp.style.display = ${detail ? "'none'" : "'inline-block'"};
    const d = document.getElementById('detail');
    if (d) {
      d.textContent = ${JSON.stringify(detail)};
      d.style.display = ${detail ? "'block'" : "'none'"};
    }
  })()`;
  win.webContents.executeJavaScript(js).catch(() => {});
}

export function setSplashVersion(win: BrowserWindow, version: string): void {
  const js = `(() => {
    const v = document.getElementById('version');
    if (v) v.textContent = ${JSON.stringify(version)};
  })()`;
  win.webContents.executeJavaScript(js).catch(() => {});
}

/**
 * Main window: a single merged title bar (custom-drawn, draggable, with the
 * native min/max/close overlaid on the right) hosting the shell menu, with the
 * Harness WebUI embedded in a <webview> below.
 */
export function createMainWindow(port: number, lang: string): BrowserWindow {
  const dark = nativeTheme.shouldUseDarkColors;
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    titleBarStyle: "hidden",
    titleBarOverlay: { ...overlayColors(), height: 40 },
    backgroundColor: dark ? "#0d1117" : "#ffffff",
    webPreferences: {
      preload: join(__dirname, "preload-shell.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: true, // embeds the live Harness WebUI
    },
  });
  nativeTheme.on("updated", () => applyTitleBarOverlay(win));
  win.loadFile(join(__dirname, "../../resources/main-shell.html"), {
    query: { port: String(port), lang },
  });
  win.once("ready-to-show", () => win.show());
  return win;
}

export function createSettingsWindow(preloadPath: string, lang: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 640,
    height: 620,
    minWidth: 520,
    minHeight: 480,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0d1117" : "#ffffff",
    title: "Settings",
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.setMenu(null); // no redundant menu bar
  win.loadFile(join(__dirname, "../../resources/settings.html"), { query: { lang } });
  return win;
}

export function openExternalFromWebContents(wc: Electron.WebContents): void {
  wc.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      if (u.protocol === "https:") void shell.openExternal(url);
    } catch {
      // invalid URL — deny
    }
    return { action: "deny" };
  });
}
