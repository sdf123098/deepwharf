/**
 * Harness advanced-settings window: a small HTTP/RPC client for the harness's
 * own `settings.describe` / `settings.mutate` API (POST /api/* on the harness
 * port), the window that renders them, and the IPC that connects the two.
 * The harness validates, persists, and hot-applies everything we write; this
 * module only maps a minimal view and forwards path-addressed edits.
 */
import { ipcMain, BrowserWindow } from "electron";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { localeForRenderer } from "./i18n";
import { rememberedWindowBounds, trackWindowBounds } from "./window";
import {
  buildMutateOps,
  describeToView,
  type HarnessSettingsView,
  type ProviderEdit,
  type RetryChoice,
} from "./harness-settings-core";

export interface HarnessSettingsContext {
  /** Current harness port; read live so restarts (fresh port) are picked up. */
  getPort: () => number;
  log: (msg: string) => void;
}

/** A wire-level RPC failure, with the harness's kebab-case error code when present. */
export class HarnessSettingsError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

interface RpcEnvelope {
  type?: string;
  rpcId?: string;
  result?: { ok?: boolean; value?: unknown; error?: { code?: string; message?: string } };
}

/** One POST leg of the harness RPC: envelope in, envelope out, rpcId echoed.
 * Exported for other main-process modules (event watcher baseline, future
 * session/credential surfaces) — the wire contract lives here, single owner. */
export async function harnessRpc(port: number, method: string, payload: unknown): Promise<unknown> {
  return rpc(port, method, payload);
}

async function rpc(port: number, method: string, payload: unknown): Promise<unknown> {
  const rpcId = randomUUID();
  const res = await fetch(`http://127.0.0.1:${port}/api/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "client-request", rpcId, method, payload }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new HarnessSettingsError("transport", `harness HTTP ${res.status}`);
  const full = (await res.json()) as RpcEnvelope;
  if (full?.type !== "server-response" || full.rpcId !== rpcId) {
    throw new HarnessSettingsError("protocol", "unexpected harness response");
  }
  if (full.result?.ok !== true) {
    const code = full.result?.error?.code ?? "rpc";
    throw new HarnessSettingsError(code, full.result?.error?.message ?? `harness ${method} failed`);
  }
  return full.result.value;
}

export async function fetchSettingsView(port: number): Promise<HarnessSettingsView> {
  return describeToView(await rpc(port, "settings.describe", {}));
}

const RETRY_CHOICES: readonly string[] = [
  "harness-default",
  "recommended",
  "unstable",
  "always",
  "custom",
];

const TIMEOUT_FIELDS = ["timeoutMsSec", "streamIdleTimeoutMsSec", "websocketConnectTimeoutMsSec"] as const;

/** Validate one renderer edit set; unknown fields and bad values are dropped. */
export function sanitizeEdits(input: unknown): ProviderEdit {
  const e = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const edits: ProviderEdit = {};
  if (typeof e.retry === "string" && RETRY_CHOICES.includes(e.retry)) {
    edits.retry = e.retry as RetryChoice;
  }
  for (const field of TIMEOUT_FIELDS) {
    const v = e[field];
    if (v === null) {
      edits[field] = null;
    } else if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      edits[field] = v;
    }
  }
  return edits;
}

export interface ApplyInput {
  providerId: string;
  ns: string;
  revision: number;
  edits: ProviderEdit;
}

export interface ApplyResult {
  ok: boolean;
  conflict?: boolean;
  error?: string;
}

export async function applyProviderChanges(port: number, input: ApplyInput): Promise<ApplyResult> {
  let kind: "deepseek" | "pi-ai";
  if (input.ns === "llm-deepseek") {
    if (input.providerId !== "deepseek") return { ok: false, error: "unknown provider" };
    kind = "deepseek";
  } else if (input.ns === "llm-pi-ai") {
    if (!input.providerId) return { ok: false, error: "unknown provider" };
    kind = "pi-ai";
  } else {
    return { ok: false, error: "unknown namespace" };
  }
  if (!Number.isFinite(input.revision) || input.revision < 0) {
    return { ok: false, error: "invalid revision" };
  }

  const ops = buildMutateOps({ kind, id: input.providerId }, input.edits);
  if (ops.length === 0) return { ok: true }; // nothing changed — no write

  try {
    await rpc(port, "settings.mutate", {
      ns: input.ns,
      ops,
      expectedRevision: input.revision,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof HarnessSettingsError && err.code === "settings-conflict") {
      return { ok: false, conflict: true };
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// --- window + IPC ---------------------------------------------------------------

let harnessSettingsWindow: BrowserWindow | null = null;

export function openHarnessSettingsWindow(preloadPath: string, locale: string): void {
  if (harnessSettingsWindow && !harnessSettingsWindow.isDestroyed()) {
    harnessSettingsWindow.focus();
    return;
  }
  harnessSettingsWindow = new BrowserWindow({
    width: 640,
    height: 660,
    ...rememberedWindowBounds("harnessSettings", { width: 560, height: 520 }),
    minWidth: 560,
    minHeight: 520,
    backgroundColor: "#0d1117",
    title: "Harness Settings",
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  trackWindowBounds("harnessSettings", harnessSettingsWindow);
  harnessSettingsWindow.loadFile(join(__dirname, "../../resources/harness-settings.html"), {
    query: { lang: locale },
  });
  harnessSettingsWindow.setMenu(null); // no redundant menu bar
  harnessSettingsWindow.on("closed", () => {
    harnessSettingsWindow = null;
  });
}

function assertHarnessSettingsSender(event: Electron.IpcMainInvokeEvent): void {
  if (
    !harnessSettingsWindow ||
    harnessSettingsWindow.isDestroyed() ||
    event.sender !== harnessSettingsWindow.webContents
  ) {
    throw new Error("unauthorized IPC sender");
  }
}

export function registerHarnessSettingsIpc(
  ctx: HarnessSettingsContext,
  onRestartHarness: () => Promise<void>,
): void {
  ipcMain.handle("harness-settings:get", async (e) => {
    assertHarnessSettingsSender(e);
    try {
      const view = await fetchSettingsView(ctx.getPort());
      return { ok: true, view };
    } catch (err) {
      ctx.log(`harness-settings get failed: ${String(err)}`);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("harness-settings:apply", async (e, input: unknown) => {
    assertHarnessSettingsSender(e);
    const o = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const providerId = typeof o.providerId === "string" ? o.providerId : "";
    const ns = typeof o.ns === "string" ? o.ns : "";
    const revision = typeof o.revision === "number" ? o.revision : NaN;
    try {
      return await applyProviderChanges(ctx.getPort(), {
        providerId,
        ns,
        revision,
        edits: sanitizeEdits(o.edits),
      });
    } catch (err) {
      ctx.log(`harness-settings apply failed: ${String(err)}`);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("harness-settings:restart", async (e) => {
    assertHarnessSettingsSender(e);
    try {
      await onRestartHarness();
      return { ok: true };
    } catch (err) {
      ctx.log(`harness-settings restart failed: ${String(err)}`);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("harness-settings:locale", (e) => {
    assertHarnessSettingsSender(e);
    return localeForRenderer();
  });
}
