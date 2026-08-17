/**
 * Shell theme runtime: resolves the stored theme id to a concrete palette,
 * hands it to every window (query param at load, "theme:changed" push after),
 * and keeps the native theme source in sync. Web UI registered themes
 * ("webui:<id>") render from the live palette the bridge reports — see
 * webui-theme.ts.
 */
import { BrowserWindow, nativeTheme } from "electron";
import { readSettings } from "./settings";
import { shellTheme, type ShellTheme } from "./pure";

export interface ThemePayload {
  id: string;
  mode: "light" | "dark";
  colors: ShellTheme["colors"];
  /** Global UI font family (shell chrome + forwarded to the web UI). */
  font: string;
}

/** Live palette state of the web UI (set by the theme bridge). */
export interface WebuiPaletteState {
  /** The web UI theme id this palette belongs to. */
  activeId: string;
  colorScheme: "light" | "dark";
  colors: ShellTheme["colors"];
}

let webuiState: WebuiPaletteState | null = null;

/** Adopt the web UI's live palette; every shell window re-themes at once. */
export function setWebuiState(s: WebuiPaletteState | null): void {
  webuiState = s;
  if (s) broadcastTheme();
}

export function getWebuiState(): WebuiPaletteState | null {
  return webuiState;
}

/** The palette in effect right now ("auto" follows the OS light/dark state). */
export function themePayload(): ThemePayload {
  const font = readSettings().fontFamily;
  const id = readSettings().theme;
  if (id.startsWith("webui:")) {
    if (webuiState && webuiState.activeId === id.slice("webui:".length)) {
      return { id, mode: webuiState.colorScheme, colors: webuiState.colors, font };
    }
    // Boot race: stored selection not yet reported by the bridge — fall back
    // to the persisted palette (or a readable base) until the snapshot lands.
    const cached = readSettings().webuiPalette;
    if (cached) return { id, mode: webuiState?.colorScheme ?? "dark", colors: cached, font };
    const base = shellTheme(webuiState?.colorScheme === "light" ? "light" : "dark");
    return { id, mode: base.mode, colors: base.colors, font };
  }
  const concrete = id === "auto" ? (nativeTheme.shouldUseDarkColors ? "dark" : "light") : id;
  const def = shellTheme(concrete);
  return { id: def.id, mode: def.mode, colors: def.colors, font };
}

/** Extra query entries every window load spreads in (theme + font). */
export function themeQuery(): Record<string, string> {
  return {
    theme: JSON.stringify(themePayload()),
    font: readSettings().fontFamily,
  };
}

/** Push a palette change to every open shell window. */
export function broadcastTheme(): void {
  const payload = themePayload();
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("theme:changed", payload);
  }
}

/** nativeTheme.themeSource mapping: concrete themes pin their base mode. */
export function themeSourceFor(id: string): "system" | "light" | "dark" {
  if (id === "auto") return "system";
  if (id.startsWith("webui:")) return webuiState?.colorScheme ?? "dark";
  return shellTheme(id).mode;
}
