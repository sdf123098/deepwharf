/**
 * Usage panel: a live view of dsh-token-meter's session projections.
 * Snapshot comes from session.list (which carries each session's projection
 * values); live updates ride the mux stream's session/projection frames that
 * the notification watcher already subscribes to — index.ts forwards them
 * here via notifyUsageProjection().
 */
import { ipcMain, BrowserWindow } from "electron";
import { join } from "node:path";
import { localeForRenderer } from "./i18n";
import { rememberedWindowBounds, trackWindowBounds } from "./window";
import { themePayload, themeQuery } from "./theme";
import { harnessRpc } from "./harness-settings";
import { normalizeSessions, type SessionRow } from "./sessions-browser";

let usageWindow: BrowserWindow | null = null;
let watchedSession: string | null = null;

export function openUsageWindow(preloadPath: string): void {
  if (usageWindow && !usageWindow.isDestroyed()) {
    usageWindow.focus();
    return;
  }
  usageWindow = new BrowserWindow({
    width: 720,
    height: 560,
    ...rememberedWindowBounds("usage", { width: 560, height: 460 }),
    minWidth: 560,
    minHeight: 440,
    backgroundColor: themePayload().colors.bg,
    title: "Usage",
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  trackWindowBounds("usage", usageWindow);
  usageWindow.loadFile(join(__dirname, "../../resources/usage.html"), {
    query: { lang: localeForRenderer(), ...themeQuery() },
  });
  usageWindow.setMenu(null);
  usageWindow.on("closed", () => {
    usageWindow = null;
    watchedSession = null;
  });
}

function assertUsageSender(event: Electron.IpcMainInvokeEvent): void {
  if (!usageWindow || usageWindow.isDestroyed() || event.sender !== usageWindow.webContents) {
    throw new Error("unauthorized IPC sender");
  }
}

/** Forward a live projection frame; only the watched session reaches the UI. */
export function notifyUsageProjection(sessionId: string, key: string, value: unknown): void {
  if (!usageWindow || usageWindow.isDestroyed()) return;
  if (watchedSession === null || sessionId !== watchedSession) return;
  if (key !== "tokenUsage" && key !== "contextPressure") return;
  usageWindow.webContents.send("usage:update", { sessionId, key, value });
}

export function registerUsageIpc(getPort: () => number, log: (m: string) => void): void {
  ipcMain.handle("usage:snapshot", async (e) => {
    assertUsageSender(e);
    try {
      const rows = normalizeSessions(await harnessRpc(getPort(), "session.list", {}));
      return { ok: true, items: rows };
    } catch (err) {
      log(`usage snapshot failed: ${String(err)}`);
      return { ok: false, items: [] as SessionRow[], error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("usage:watch", (e, sessionId: unknown) => {
    assertUsageSender(e);
    watchedSession = typeof sessionId === "string" && sessionId !== "" ? sessionId : null;
    return { ok: true };
  });

  ipcMain.handle("usage:locale", (e) => {
    assertUsageSender(e);
    return localeForRenderer();
  });
}
