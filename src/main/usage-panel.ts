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
import { isSettingsPageSender, settingsPageSender } from "./settings-page";

let watchedSession: string | null = null;

function assertUsageSender(event: Electron.IpcMainInvokeEvent): void {
  if (!isSettingsPageSender(event.sender)) {
    throw new Error("unauthorized IPC sender");
  }
}

/** Forward a live projection frame; only the watched session reaches the UI. */
export function notifyUsageProjection(sessionId: string, key: string, value: unknown): void {
  if (key !== "tokenUsage" && key !== "contextPressure") return;
  if (watchedSession !== null && sessionId !== watchedSession) return;
  settingsPageSender()?.send("usage:update", { sessionId, key, value });
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
