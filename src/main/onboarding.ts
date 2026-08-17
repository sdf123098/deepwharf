/**
 * First-run API-key onboarding. Discovers the credential references the
 * harness's settings schemas declare (meta.role "credential-ref"), checks
 * them through the official credentials.describe RPC, and — when some are
 * unconfigured — offers a small window to fill them via credentials.set.
 * Values land in the harness's managed credential store ($DSH_HOME) and take
 * effect immediately; nothing here edits settings.yaml or env files.
 */
import { ipcMain, BrowserWindow } from "electron";
import { join } from "node:path";
import { localeForRenderer } from "./i18n";
import { rememberedWindowBounds, trackWindowBounds } from "./window";
import { themePayload, themeQuery } from "./theme";
import { readSettings, updateSettings } from "./settings";
import { harnessRpc } from "./harness-settings";
import { discoverCredentialRefs } from "./harness-settings-core";

export interface CredentialItem {
  ref: string;
  configured: boolean;
  source?: string;
}

export interface CredentialStatus {
  ok: boolean;
  items: CredentialItem[];
  error?: string;
}

const CREDENTIAL_REF_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** settings.describe + credentials.describe folded into one status answer. */
export async function fetchCredentialStatus(port: number): Promise<CredentialStatus> {
  try {
    const describe = await harnessRpc(port, "settings.describe", {});
    const refs = discoverCredentialRefs(describe);
    if (refs.length === 0) return { ok: true, items: [] };
    const answer = (await harnessRpc(port, "credentials.describe", { refs })) as {
      credentials?: Record<string, { configured?: boolean; source?: string }>;
    };
    const map = answer?.credentials ?? {};
    const items: CredentialItem[] = refs.map((ref) => ({
      ref,
      configured: map[ref]?.configured === true,
      source: typeof map[ref]?.source === "string" ? map[ref].source : undefined,
    }));
    return { ok: true, items };
  } catch (err) {
    return { ok: false, items: [], error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Write the non-empty submitted values. Only refs that were just shown as
 * unconfigured are accepted, so a stale renderer cannot overwrite a working
 * credential it never saw.
 */
export async function applyCredentialValues(
  port: number,
  unconfiguredRefs: readonly string[],
  values: Record<string, string>,
): Promise<CredentialStatus> {
  for (const [ref, value] of Object.entries(values)) {
    if (typeof value !== "string" || value.trim() === "") continue;
    if (!CREDENTIAL_REF_RE.test(ref) || !unconfiguredRefs.includes(ref)) continue;
    await harnessRpc(port, "credentials.set", { ref, value: value.trim() });
  }
  return fetchCredentialStatus(port);
}

// --- window + IPC ---------------------------------------------------------------

let onboardingWindow: BrowserWindow | null = null;

export function onboardingWindowOpen(): boolean {
  return onboardingWindow !== null && !onboardingWindow.isDestroyed();
}

export function openOnboardingWindow(preloadPath: string): void {
  if (onboardingWindowOpen()) {
    onboardingWindow?.focus();
    return;
  }
  onboardingWindow = new BrowserWindow({
    width: 520,
    height: 460,
    ...rememberedWindowBounds("onboarding", { width: 460, height: 400 }),
    minWidth: 460,
    minHeight: 400,
    backgroundColor: themePayload().colors.bg,
    frame: false, // frameless sub-window with chrome.js header
    title: "DeepWharf",
    resizable: true,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  trackWindowBounds("onboarding", onboardingWindow);
  onboardingWindow.loadFile(join(__dirname, "../../resources/onboarding.html"), {
    query: { lang: localeForRenderer(), ...themeQuery() },
  });
  onboardingWindow.setMenu(null);
  onboardingWindow.on("closed", () => {
    onboardingWindow = null;
  });
}

function assertOnboardingSender(event: Electron.IpcMainInvokeEvent): void {
  if (
    !onboardingWindow ||
    onboardingWindow.isDestroyed() ||
    event.sender !== onboardingWindow.webContents
  ) {
    throw new Error("unauthorized IPC sender");
  }
}

/** Refs the status snapshot showed as unconfigured (the window's write scope). */
let unconfiguredScope: string[] = [];

export function registerOnboardingIpc(getPort: () => number, log: (m: string) => void): void {
  ipcMain.handle("onboarding:status", async (e) => {
    assertOnboardingSender(e);
    const status = await fetchCredentialStatus(getPort());
    unconfiguredScope = status.items.filter((i) => !i.configured).map((i) => i.ref);
    return status;
  });

  ipcMain.handle("onboarding:save", async (e, values: unknown) => {
    assertOnboardingSender(e);
    const clean: Record<string, string> = {};
    if (values && typeof values === "object" && !Array.isArray(values)) {
      for (const [k, v] of Object.entries(values as Record<string, unknown>)) {
        if (typeof v === "string") clean[k] = v;
      }
    }
    try {
      return await applyCredentialValues(getPort(), unconfiguredScope, clean);
    } catch (err) {
      log(`onboarding save failed: ${String(err)}`);
      return { ok: false, items: [], error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("onboarding:skip", (e) => {
    assertOnboardingSender(e);
    updateSettings({ onboardingDismissed: true });
    return { ok: true };
  });

  ipcMain.handle("onboarding:locale", (e) => {
    assertOnboardingSender(e);
    return localeForRenderer();
  });
}

/** Auto-open gate: once per run, never after the user dismissed it. */
export function shouldAutoOpenOnboarding(): boolean {
  return !readSettings().onboardingDismissed;
}
