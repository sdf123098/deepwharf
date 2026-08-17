/**
 * Session history browser: a desktop window over the harness's own session
 * APIs — session.list (rows + projections incl. the title), session.search
 * (id + snippet), and GET /api/session.export (a streaming ZIP with the
 * session log, subagent descendants, and referenced media).
 */
import { ipcMain, BrowserWindow, dialog } from "electron";
import { writeFileSync } from "node:fs";
import { localeForRenderer, t } from "./i18n";
import { isSettingsPageSender, settingsPageSender } from "./settings-page";
import { harnessRpc } from "./harness-settings";
import { parseTokenUsage, type TokenUsage } from "./pure";

export interface SessionPressure {
  used?: number;
  contextWindow?: number;
}

export interface SessionRow {
  sessionId: string;
  title: string;
  running: boolean;
  blank: boolean;
  cwd?: string;
  agentPreset?: string;
  updatedAt: number;
  usage?: TokenUsage;
  pressure?: SessionPressure;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Normalize a session.list value into display rows. Subagent children are
 * dropped (they churn and belong to their parent's view in the web UI).
 */
export function normalizeSessions(value: unknown): SessionRow[] {
  const items = isRecord(value) && Array.isArray(value.items) ? value.items : [];
  const rows: SessionRow[] = [];
  for (const raw of items) {
    if (!isRecord(raw)) continue;
    const sessionId = typeof raw.sessionId === "string" ? raw.sessionId : "";
    if (!sessionId) continue;
    if (raw.origin === "subagent" || raw.parentSessionId !== undefined) continue;
    const projections = isRecord(raw.projections) ? raw.projections : undefined;
    const values = isRecord(projections?.values) ? projections.values : undefined;
    const title = typeof values?.title === "string" ? values.title : "";
    const usage = parseTokenUsage(values?.tokenUsage) ?? undefined;
    let pressure: SessionPressure | undefined;
    const p = isRecord(values?.contextPressure) ? (values.contextPressure as Record<string, unknown>) : undefined;
    if (p) {
      pressure = {
        used: typeof p.projectedTokens === "number" ? p.projectedTokens : typeof p.pressureTokens === "number" ? p.pressureTokens : undefined,
        contextWindow: typeof p.contextWindow === "number" ? p.contextWindow : undefined,
      };
    }
    rows.push({
      sessionId,
      title,
      running: raw.running === true,
      blank: raw.blank === true,
      cwd: typeof raw.cwd === "string" ? raw.cwd : undefined,
      agentPreset: typeof raw.agentPreset === "string" ? raw.agentPreset : undefined,
      updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
      usage,
      pressure,
    });
  }
  rows.sort((a, b) => b.updatedAt - a.updatedAt);
  return rows;
}

// --- IPC ------------------------------------------------------------------------

function assertSessionsSender(event: Electron.IpcMainInvokeEvent): void {
  if (!isSettingsPageSender(event.sender)) {
    throw new Error("unauthorized IPC sender");
  }
}

/** Stream one session's export ZIP to a user-chosen file. */
async function exportSession(port: number, sessionId: string): Promise<{ ok: boolean; cancelled?: boolean; error?: string; path?: string }> {
  const short = sessionId.slice(0, 8);
  const page = settingsPageSender();
  const parent = page ? BrowserWindow.fromWebContents(page) : null;
  const opts: Electron.SaveDialogOptions = {
    title: t("sessionsExportTitle"),
    defaultPath: `deepwharf-session-${short}.zip`,
    filters: [{ name: "ZIP", extensions: ["zip"] }],
  };
  const { canceled, filePath } = parent
    ? await dialog.showSaveDialog(parent, opts)
    : await dialog.showSaveDialog(opts);
  if (canceled || !filePath) return { ok: false, cancelled: true };

  const url =
    `http://127.0.0.1:${port}/api/session.export?sessionId=${encodeURIComponent(sessionId)}` +
    `&includeDescendants=true`;
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) return { ok: false, error: `harness HTTP ${res.status}` };
  const bytes = Buffer.from(await res.arrayBuffer());
  try {
    writeFileSync(filePath, bytes);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  return { ok: true, path: filePath };
}

export function registerSessionsIpc(getPort: () => number, log: (m: string) => void): void {
  ipcMain.handle("sessions:list", async (e) => {
    assertSessionsSender(e);
    try {
      return { ok: true, items: normalizeSessions(await harnessRpc(getPort(), "session.list", {})) };
    } catch (err) {
      log(`session.list failed: ${String(err)}`);
      return { ok: false, items: [], error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("sessions:search", async (e, query: unknown) => {
    assertSessionsSender(e);
    const q = typeof query === "string" ? query.trim() : "";
    if (q === "") return { ok: true, items: [], hasMore: false };
    try {
      const value = (await harnessRpc(getPort(), "session.search", { query: q })) as {
        items?: Array<{ sessionId?: unknown; snippet?: unknown }>;
        hasMore?: unknown;
      };
      const items = (value?.items ?? []).map((r) => ({
        sessionId: typeof r.sessionId === "string" ? r.sessionId : "",
        snippet: typeof r.snippet === "string" ? r.snippet : "",
      })).filter((r) => r.sessionId !== "");
      return { ok: true, items, hasMore: value?.hasMore === true };
    } catch (err) {
      log(`session.search failed: ${String(err)}`);
      return { ok: false, items: [], error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("sessions:export", async (e, sessionId: unknown) => {
    assertSessionsSender(e);
    if (typeof sessionId !== "string" || sessionId === "") return { ok: false, error: "invalid session" };
    try {
      return await exportSession(getPort(), sessionId);
    } catch (err) {
      log(`session.export failed: ${String(err)}`);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("sessions:locale", (e) => {
    assertSessionsSender(e);
    return localeForRenderer();
  });
}
