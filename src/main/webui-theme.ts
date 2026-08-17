/**
 * Shell ↔ web UI theme sync state machine.
 *
 * Three paths, by theme kind:
 *  - built-ins (auto/light/dark): write the harness's own `ui-theme`
 *    preference over the settings RPC — persisted server-side, hot-adopted by
 *    the web client, no bridge needed.
 *  - extras + third-party ids (registered browser-side by the companion or
 *    theme plugins): a `set-theme` command over the bridge; the selection is
 *    session-only in the web UI, so it is stored in desktop.json and replayed
 *    after every webview load (the companion's hello snapshot tells us the
 *    registry is up).
 *  - reverse sync: a snapshot whose preference we did not cause means the
 *    user changed the theme inside the web UI — the shell adopts it (id +
 *    derived chrome palette) and disarms, so last-writer-wins is symmetric.
 */
import { harnessRpc } from "./harness-settings";
import { readSettings, updateSettings } from "./settings";
import { broadcastTheme, setWebuiState } from "./theme";
import {
  paletteFromWebui,
  parseWebuiSnapshot,
  type WebuiThemeInfo,
  type WebuiThemeSnapshot,
} from "./pure";

export interface WebuiThemeContext {
  /** Current harness port; 0 = harness down. */
  getPort: () => number;
  log: (m: string) => void;
  /** Deliver a bridge command to the guest (embedder relays via postMessage). */
  sendCommand: (cmd: { source: string; type: string; id?: string; value?: string }) => void;
}

let ctx: WebuiThemeContext | null = null;
/** Latest snapshot; null until the first one after each webview load. */
let snapshot: WebuiThemeSnapshot | null = null;

export function initWebuiTheme(context: WebuiThemeContext): void {
  ctx = context;
}

/** The web UI theme ids the picker can offer right now (cached). */
export function webuiThemesForPicker(): WebuiThemeInfo[] {
  return readSettings().webuiThemes;
}

function isBuiltinShellTheme(theme: string): boolean {
  return theme === "auto" || theme === "light" || theme === "dark";
}

/** The web UI preference/theme id the shell's current selection maps to. */
function expectedPreference(): string {
  const theme = readSettings().theme;
  if (theme === "auto") return "system";
  if (theme === "light" || theme === "dark") return theme;
  return theme.startsWith("webui:") ? theme.slice("webui:".length) : theme;
}

/**
 * Push the shell's current theme to the web UI. Called when the user changes
 * the theme in shell settings (arms the link).
 */
export function requestWebuiThemeSync(): void {
  updateSettings({ webuiLinked: true });
  const theme = readSettings().theme;
  if (isBuiltinShellTheme(theme)) {
    const value = theme === "auto" ? "system" : theme;
    const port = ctx?.getPort() ?? 0;
    if (port === 0) return;
    harnessRpc(port, "settings.mutate", {
      ns: "ui-theme",
      ops: [{ op: "set", path: ["preference"], value }],
    })
      .then(() => ctx?.log(`web UI theme preference -> ${value}`))
      .catch((err) => ctx?.log(`ui-theme mutate failed: ${String(err)}`));
    return;
  }
  sendSetTheme(expectedPreference());
}

function sendSetTheme(id: string): void {
  if (!id) return;
  ctx?.sendCommand({ source: "deepwharf-shell", type: "set-theme", id });
}

/** Push the shell's global font to the web UI (--dsw-font-family override). */
export function requestWebuiFontSync(): void {
  ctx?.sendCommand({ source: "deepwharf-shell", type: "set-font", value: readSettings().fontFamily });
}

/**
 * The webview (re)loaded — reset the snapshot generation and ask the
 * companion to re-introduce itself; a stored extra/third-party selection is
 * replayed on that first snapshot.
 */
export function handleWebuiLoaded(): void {
  snapshot = null;
  ctx?.sendCommand({ source: "deepwharf-shell", type: "ping" });
}

/**
 * A bridge snapshot arrived (hello, theme/change echo, or a ping reply).
 * Payloads cross a trust boundary — parseWebuiSnapshot whitelists everything.
 */
export function handleWebuiSnapshot(payload: unknown): void {
  const snap = parseWebuiSnapshot(payload);
  if (!snap) return;
  const first = snapshot === null;
  snapshot = snap;
  if (first) ctx?.log(`webui theme snapshot: active=${snap.activeId} themes=${snap.themes.length}`);

  const settings = readSettings();
  const theme = settings.theme;
  const palette = paletteFromWebui(snap.tokens);
  const patch: Record<string, unknown> = {};

  if (palette) {
    setWebuiState({ activeId: snap.activeId, colorScheme: snap.colorScheme, colors: palette });
    patch.webuiPalette = palette;
  }
  if (JSON.stringify(snap.themes) !== JSON.stringify(settings.webuiThemes)) {
    patch.webuiThemes = snap.themes;
  }

  const expected = expectedPreference();
  if (first && settings.webuiLinked && !isBuiltinShellTheme(theme)) {
    // Fresh webview: an extra/third-party selection is session-only in the
    // web UI, so re-apply it now that the registry is up again.
    if (snap.activeId !== expected) {
      sendSetTheme(expected);
      if (Object.keys(patch).length > 0) updateSettings(patch);
      return;
    }
  } else if (!settings.webuiLinked && snap.preference !== expected) {
    // The preference moved without the shell driving it (now, or before this
    // boot): the user changed the theme inside the web UI. Adopt (last
    // writer: the web UI); chrome follows via the derived palette above.
    const adopted =
      snap.preference === "system"
        ? "auto"
        : snap.preference === "light" || snap.preference === "dark"
          ? snap.preference
          : snap.preference.startsWith("webui:")
            ? snap.preference
            : `webui:${snap.preference}`;
    if (adopted !== theme) patch.theme = adopted;
    patch.webuiLinked = false;
  }
  // Armed + matching (or built-in, persisted server-side): the caches above
  // are all we take — the shell never overwrites the web UI's own pick.

  if (Object.keys(patch).length > 0) updateSettings(patch);
  if (patch.theme !== undefined) broadcastTheme();
  // The font override is session-only in the web UI too — re-apply on hello.
  if (first) requestWebuiFontSync();
}
