import { BrowserWindow, screen, shell, nativeTheme } from "electron";
import { join } from "node:path";
import { readSettings, updateSettings } from "./settings";
import { sanitizeWindowBounds } from "./pure";
import { themePayload, themeQuery } from "./theme";

/** Title-bar overlay colors come from the active shell theme. */
export function applyTitleBarOverlay(win: BrowserWindow): void {
  const theme = themePayload();
  try {
    win.setTitleBarOverlay({ color: theme.colors.bg, symbolColor: theme.colors.text, height: 40 });
  } catch {
    // not supported on this platform
  }
}

// --- window geometry memory ---------------------------------------------------

const SAVE_DEBOUNCE_MS = 400;

/** True when at least part of the rect lands on a connected display. */
function isOnScreen(x: number, y: number, width: number, height: number): boolean {
  try {
    return screen.getAllDisplays().some((d) => {
      const a = d.workArea;
      return x < a.x + a.width && x + width > a.x && y < a.y + a.height && y + height > a.y;
    });
  } catch {
    return true; // screen module not ready yet — let Electron center the window
  }
}

/**
 * Saved bounds for a window id (from desktop.json), clamped to the window's own
 * minimum and pulled back on-screen when the saved position is stale (monitor
 * unplugged, resolution changed). Returns {} to let Electron default/center.
 */
export function rememberedWindowBounds(
  id: string,
  min: { width: number; height: number },
): Partial<{ x: number; y: number; width: number; height: number }> {
  const saved = sanitizeWindowBounds(readSettings().windowBounds?.[id]);
  if (!saved) return {};
  const width = Math.max(saved.width, min.width);
  const height = Math.max(saved.height, min.height);
  const opts: { x?: number; y?: number; width: number; height: number } = { width, height };
  if (saved.x !== undefined && saved.y !== undefined && isOnScreen(saved.x, saved.y, width, height)) {
    opts.x = saved.x;
    opts.y = saved.y;
  }
  return opts;
}

/**
 * Persist a window's normal bounds (size + position) back into desktop.json:
 * debounced on move/resize so dragging never thrashes the file, always flushed
 * on close. A maximized window keeps its pre-maximize normal bounds.
 */
export function trackWindowBounds(id: string, win: BrowserWindow): void {
  let timer: NodeJS.Timeout | null = null;
  const save = () => {
    if (win.isDestroyed()) return;
    const b = win.getNormalBounds();
    const next = { ...readSettings().windowBounds, [id]: { x: b.x, y: b.y, width: b.width, height: b.height } };
    updateSettings({ windowBounds: next });
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      save();
    }, SAVE_DEBOUNCE_MS);
  };
  win.on("resize", schedule);
  win.on("move", schedule);
  win.on("close", () => {
    if (timer) clearTimeout(timer);
    save();
  });
}

export function createSplashWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 480,
    height: 300,
    frame: false,
    resizable: false,
    show: false,
    backgroundColor: themePayload().colors.bg,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  win.loadFile(join(__dirname, "../../resources/splash.html"), {
    query: { ...themeQuery() },
  });
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
  const theme = themePayload();
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    ...rememberedWindowBounds("main", { width: 1000, height: 700 }),
    minWidth: 1000,
    minHeight: 700,
    show: false,
    titleBarStyle: "hidden",
    titleBarOverlay: { color: theme.colors.bg, symbolColor: theme.colors.text, height: 40 },
    backgroundColor: theme.colors.bg,
    webPreferences: {
      preload: join(__dirname, "preload-shell.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: true, // embeds the live Harness WebUI
    },
  });
  trackWindowBounds("main", win);
  // Keep the title-bar overlay in sync with theme changes (explicit and, for
  // "auto", OS light/dark flips), and drop the listener when the window goes
  // away so nativeTheme does not hold it.
  const onThemeUpdated = () => applyTitleBarOverlay(win);
  nativeTheme.on("updated", onThemeUpdated);
  win.on("closed", () => nativeTheme.removeListener("updated", onThemeUpdated));
  win.loadFile(join(__dirname, "../../resources/main-shell.html"), {
    query: { port: String(port), lang, ...themeQuery() },
  });
  win.once("ready-to-show", () => win.show());
  return win;
}

export function createSettingsWindow(preloadPath: string, lang: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 640,
    height: 740,
    ...rememberedWindowBounds("settings", { width: 520, height: 480 }),
    minWidth: 520,
    minHeight: 480,
    backgroundColor: themePayload().colors.bg,
    title: "Settings",
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  trackWindowBounds("settings", win);
  win.setMenu(null); // no redundant menu bar
  win.loadFile(join(__dirname, "../../resources/settings.html"), {
    query: { lang, ...themeQuery() },
  });
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
