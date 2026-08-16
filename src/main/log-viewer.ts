/**
 * Live log viewer: a window that tails desktop.log / harness.log. The harness
 * log is written by our own spawn pipe and both files rotate (rename + new
 * file) at 20MB, so the poller tracks a byte offset per file and treats a
 * shrinking file as a rotation (re-seed from the tail). A streaming
 * TextDecoder per channel keeps multi-byte characters intact across chunk
 * boundaries.
 */
import { ipcMain, BrowserWindow, shell } from "electron";
import { openSync, readSync, fstatSync, closeSync } from "node:fs";
import { TextDecoder } from "node:util";
import { join } from "node:path";
import { localeForRenderer } from "./i18n";
import { rememberedWindowBounds, trackWindowBounds } from "./window";
import { themePayload, themeQuery } from "./theme";

export type LogWhich = "desktop" | "harness";

export interface LogViewerContext {
  desktopLog: string;
  harnessLog: string;
  logsDir: string;
  log: (m: string) => void;
}

const INITIAL_TAIL = 64 * 1024;
const MAX_CHUNK = 256 * 1024;
const POLL_MS = 1000;

interface ChannelState {
  file: string;
  offset: number;
  decoder: TextDecoder;
}

function channelFile(ctx: LogViewerContext, which: LogWhich): string {
  return which === "desktop" ? ctx.desktopLog : ctx.harnessLog;
}

export interface LogChunk {
  which: LogWhich;
  text: string;
  offset: number;
  rotated: boolean;
}

interface ChannelUpdate {
  text: string;
  offset: number;
  rotated: boolean;
}

/**
 * Read everything new since `state.offset`. A file smaller than the offset
 * means rotation: restart from the current tail and flag it so the renderer
 * can drop its stale buffer.
 */
export function pollChannel(state: ChannelState): ChannelUpdate {
  let fd: number | undefined;
  try {
    fd = openSync(state.file, "r");
    const size = fstatSync(fd).size;
    if (size < state.offset) {
      state.offset = Math.max(0, size - INITIAL_TAIL);
      state.decoder = new TextDecoder();
      const buf = Buffer.alloc(size - state.offset);
      readSync(fd, buf, 0, buf.length, state.offset);
      state.offset = size;
      return { text: state.decoder.decode(buf), offset: size, rotated: true };
    }
    if (size === state.offset) {
      return { text: "", offset: state.offset, rotated: false };
    }
    const len = Math.min(size - state.offset, MAX_CHUNK);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, state.offset);
    state.offset += len;
    return { text: state.decoder.decode(buf), offset: state.offset, rotated: false };
  } catch {
    // missing file or busy — nothing new to show this tick
    return { text: "", offset: state.offset, rotated: false };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

// --- window + IPC ---------------------------------------------------------------

let logWindow: BrowserWindow | null = null;
let pollTimer: NodeJS.Timeout | null = null;
let channels: Map<LogWhich, ChannelState> = new Map();

export function openLogViewerWindow(preloadPath: string, ctx: LogViewerContext): void {
  if (logWindow && !logWindow.isDestroyed()) {
    logWindow.focus();
    return;
  }
  logWindow = new BrowserWindow({
    width: 900,
    height: 640,
    ...rememberedWindowBounds("logs", { width: 640, height: 420 }),
    minWidth: 560,
    minHeight: 360,
    backgroundColor: themePayload().colors.bg,
    title: "Logs",
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  trackWindowBounds("logs", logWindow);
  logWindow.loadFile(join(__dirname, "../../resources/log-viewer.html"), {
    query: { lang: localeForRenderer(), ...themeQuery() },
  });
  logWindow.setMenu(null);

  channels = new Map();
  for (const which of ["desktop", "harness"] as const) {
    channels.set(which, { file: channelFile(ctx, which), offset: 0, decoder: new TextDecoder() });
    // seed with the tail so the window opens with context, not a blank page
    const seed: ChannelState = channels.get(which)!;
    try {
      const fd = openSync(seed.file, "r");
      const size = fstatSync(fd).size;
      seed.offset = Math.max(0, size - INITIAL_TAIL);
      closeSync(fd);
    } catch {
      seed.offset = 0;
    }
  }

  pollTimer = setInterval(() => {
    if (!logWindow || logWindow.isDestroyed()) return;
    for (const [which, state] of channels) {
      const update = pollChannel(state);
      if (update.text !== "" || update.rotated) {
        logWindow.webContents.send("log-viewer:chunk", { which, ...update } satisfies LogChunk);
      }
    }
  }, POLL_MS);

  const stop = () => {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  };
  logWindow.on("closed", () => {
    stop();
    logWindow = null;
  });
}

function assertLogSender(event: Electron.IpcMainInvokeEvent): void {
  if (!logWindow || logWindow.isDestroyed() || event.sender !== logWindow.webContents) {
    throw new Error("unauthorized IPC sender");
  }
}

export function registerLogViewerIpc(ctx: LogViewerContext): void {
  ipcMain.handle("log-viewer:locale", (e) => {
    assertLogSender(e);
    return localeForRenderer();
  });
  ipcMain.handle("log-viewer:openLogs", (e) => {
    assertLogSender(e);
    return shell.openPath(ctx.logsDir);
  });
}
