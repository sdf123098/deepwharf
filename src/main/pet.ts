/**
 * Desktop pet: a transparent always-on-top window with the mascot cutout.
 * Interactions live in the renderer (pet.js); this module owns the window,
 * the right-click menu, drag movement, position memory, and the usage feed.
 *
 * Usage data rides the same token-meter projections the notification watcher
 * already receives: the pet tracks every non-subagent session's latest
 * tokenUsage/contextPressure pair and displays the most recently updated one.
 */
import { BrowserWindow, ipcMain, Menu, screen } from "electron";
import { join } from "node:path";
import { readSettings, updateSettings } from "./settings";
import { localeForRenderer, t } from "./i18n";
import { formatUsageSummary, parseTokenUsage, type TokenUsage } from "./pure";
import { normalizeSessions, type SessionPressure } from "./sessions-browser";
import { harnessRpc } from "./harness-settings";

const PET_W = 240;
const PET_H = 300;
const PET_MARGIN = 8;

let petWindow: BrowserWindow | null = null;
let onShowMain: () => void = () => {};
let onLog: ((m: string) => void) | null = null;
let getMainBounds: (() => Electron.Rectangle) | null = null;
let onPetVisibleChange: ((visible: boolean) => void) | null = null;
let petPosTimer: NodeJS.Timeout | null = null;

interface PetUsageEntry {
  usage: TokenUsage | null;
  pressure: unknown;
  at: number;
}
/** Latest projection pair per session; the newest `at` is the sign's source. */
const usageBySession = new Map<string, PetUsageEntry>();
let lastSignText = "";

export function petWindowExists(): boolean {
  return petWindow !== null && !petWindow.isDestroyed();
}

function send(channel: string, payload: unknown): void {
  if (!petWindowExists()) return;
  petWindow!.webContents.send(channel, payload);
}

function pushSign(): void {
  let best: { entry: PetUsageEntry } | null = null;
  for (const entry of usageBySession.values()) {
    if (!best || entry.at > best.entry.at) best = { entry };
  }
  const text = best
    ? formatUsageSummary(
        best.entry.usage,
        best.entry.pressure,
        localeForRenderer() === "zh-CN" ? "zh-CN" : "en-US",
      )
    : "";
  if (text === lastSignText) return;
  lastSignText = text;
  send("pet:usage", text);
}

/** Live projection frame from the event watcher (subagents already filtered). */
export function notifyPetProjection(sessionId: string, key: string, value: unknown): void {
  if (key !== "tokenUsage" && key !== "contextPressure") return;
  const entry = usageBySession.get(sessionId) ?? { usage: null, pressure: null, at: 0 };
  if (key === "tokenUsage") {
    const parsed = parseTokenUsage(value);
    if (parsed) entry.usage = parsed;
  } else {
    entry.pressure = value;
  }
  entry.at = Date.now();
  usageBySession.set(sessionId, entry);
  pushSign();
}

/** Session went away — drop its usage so the sign follows the living one. */
export function notifyPetSessionRemoved(sessionId: string): void {
  if (usageBySession.delete(sessionId)) pushSign();
}

/** Rebuild a contextPressure-shaped value from a normalized row. */
function pressureProjection(p: SessionPressure): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof p.used === "number") out.projectedTokens = p.used;
  if (typeof p.contextWindow === "number") out.contextWindow = p.contextWindow;
  return out;
}

/** Baseline from session.list so the sign is populated right at startup. */
export async function primePetUsage(port: number): Promise<void> {
  try {
    const rows = normalizeSessions(await harnessRpc(port, "session.list", {}));
    for (const row of rows) {
      if (!row.usage && !row.pressure) continue;
      usageBySession.set(row.sessionId, {
        usage: row.usage ?? null,
        pressure: row.pressure ? pressureProjection(row.pressure) : null,
        at: row.updatedAt,
      });
    }
    pushSign();
  } catch {
    // harness down / list failed — live frames will fill in
  }
}

/** Pet reactions to watcher edges (task finished / agent error). */
export function notifyPetEvent(kind: "done" | "error"): void {
  send("pet:event", kind);
}

function clampOnScreen(x: number, y: number): { x: number; y: number } | undefined {
  const area = screen.getPrimaryDisplay().workArea;
  if (x < area.x - PET_W || y < area.y - PET_H || x > area.x + area.width || y > area.y + area.height) {
    return undefined; // saved position is off-screen (monitor change) — re-place
  }
  return { x, y };
}

/** Default spot: the bottom-right corner of the main window (8px inside),
 * clamped to the primary display's work area. */
function defaultPosition(): { x: number; y: number } {
  const area = screen.getPrimaryDisplay().workArea;
  const main = getMainBounds?.();
  if (main && main.width > 0 && main.height > 0) {
    const x = Math.min(main.x + main.width - PET_W - PET_MARGIN, area.x + area.width - PET_W);
    const y = Math.min(main.y + main.height - PET_H - PET_MARGIN, area.y + area.height - PET_H);
    return { x: Math.max(area.x, x), y: Math.max(area.y, y) };
  }
  return {
    x: area.x + area.width - PET_W - PET_MARGIN * 2,
    y: area.y + area.height - PET_H - PET_MARGIN * 2,
  };
}

export function showPet(): void {
  if (!readSettings().petEnabled) return;
  if (petWindowExists()) {
    petWindow!.show();
    onPetVisibleChange?.(true);
    return;
  }
  const saved = readSettings().petPos;
  const pos = saved ? clampOnScreen(saved.x, saved.y) : defaultPosition();
  petWindow = new BrowserWindow({
    width: PET_W,
    height: PET_H,
    ...(pos ?? {}),
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload-pet.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  petWindow.setAlwaysOnTop(true, "screen-saver");
  petWindow.setMenu(null);
  petWindow.webContents.on("console-message", (_e, level, message) => {
    // renderer diagnostics: only warnings/errors surface to the desktop log
    if (level >= 2) onLog?.(`pet renderer: ${message}`);
  });
  petWindow.webContents.on("preload-error", (_e, preloadPath, error) => {
    onLog?.(`pet preload failed (${preloadPath}): ${String(error)}`);
  });
  petWindow.loadFile(join(__dirname, "../../resources/pet.html"), {
    query: {
      lang: localeForRenderer(),
      sign: readSettings().petSignEnabled ? "1" : "0",
    },
  });
  petWindow.once("ready-to-show", () => {
    if (!petWindowExists()) return;
    petWindow!.show();
    onPetVisibleChange?.(true);
    lastSignText = ""; // renderer restarted — force a re-push
    pushSign();
  });
  petWindow.on("moved", () => {
    if (!petWindowExists()) return;
    const b = petWindow!.getBounds();
    if (petPosTimer) clearTimeout(petPosTimer);
    petPosTimer = setTimeout(() => {
      petPosTimer = null;
      updateSettings({ petPos: { x: b.x, y: b.y } });
    }, 500);
  });
  petWindow.on("closed", () => {
    petWindow = null;
    onPetVisibleChange?.(false);
  });
}

export function hidePet(): void {
  if (!petWindowExists()) return;
  petWindow!.close();
}

/** Reflect the settings toggles into the live window (if any). */
export function applyPetSettings(): void {
  if (readSettings().petEnabled) {
    showPet();
    send("pet:sign", readSettings().petSignEnabled);
  } else {
    hidePet();
  }
}

export interface PetHooks {
  showMain: () => void;
  /** Desktop log sink (pet renderer diagnostics). */
  log?: (m: string) => void;
  /** Main window bounds used for the default pet position. */
  getMainBounds?: () => Electron.Rectangle;
  /** Fired whenever the pet window appears or disappears (close included),
   * so the tray menu label can mirror the real state. */
  onPetVisibleChange?: (visible: boolean) => void;
}

/** Wire the pet's external dependencies once at boot. */
export function initPet(hooks: PetHooks): void {
  onShowMain = hooks.showMain;
  onLog = hooks.log ?? null;
  getMainBounds = hooks.getMainBounds ?? null;
  onPetVisibleChange = hooks.onPetVisibleChange ?? null;

  const assertPetSender = (sender: Electron.WebContents) => {
    if (!petWindowExists() || sender !== petWindow!.webContents) {
      throw new Error("unauthorized IPC sender");
    }
  };

  // Manual drag: the renderer tracks the pointer and sends deltas.
  ipcMain.on("pet:move", (e, dx: unknown, dy: unknown) => {
    if (!petWindowExists() || e.sender !== petWindow!.webContents) return;
    if (typeof dx !== "number" || typeof dy !== "number" || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const b = petWindow!.getBounds();
    petWindow!.setPosition(Math.round(b.x + dx), Math.round(b.y + dy));
  });

  ipcMain.on("pet:context-menu", (e) => {
    assertPetSender(e.sender);
    Menu.buildFromTemplate([
      {
        label: t("petMenuSign"),
        type: "checkbox",
        checked: readSettings().petSignEnabled,
        click: () => {
          updateSettings({ petSignEnabled: !readSettings().petSignEnabled });
          send("pet:sign", readSettings().petSignEnabled);
        },
      },
      { type: "separator" },
      { label: t("petMenuOpen"), click: () => onShowMain() },
      { label: t("petMenuHide"), click: () => hidePet() },
    ]).popup({ window: petWindow! });
  });

  ipcMain.on("pet:open-main", (e) => {
    assertPetSender(e.sender);
    onShowMain();
  });

  ipcMain.handle("pet:locale", (e) => {
    assertPetSender(e.sender);
    return localeForRenderer();
  });
}
