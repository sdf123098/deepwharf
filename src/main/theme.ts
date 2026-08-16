/**
 * Shell theme runtime: resolves the stored theme id to a concrete palette,
 * hands it to every window (query param at load, "theme:changed" push after),
 * and keeps the native theme source in sync so the embedded Harness web UI
 * follows the same light/dark base as the shell chrome.
 */
import { BrowserWindow, nativeTheme } from "electron";
import { readSettings } from "./settings";
import { shellTheme, type ShellTheme } from "./pure";

export interface ThemePayload {
  id: string;
  mode: "light" | "dark";
  colors: ShellTheme["colors"];
}

/** The palette in effect right now ("auto" follows the OS light/dark state). */
export function themePayload(): ThemePayload {
  const id = readSettings().theme;
  const concrete = id === "auto" ? (nativeTheme.shouldUseDarkColors ? "dark" : "light") : id;
  const def = shellTheme(concrete);
  return { id: def.id, mode: def.mode, colors: def.colors };
}

/** Extra query entries every window load spreads in. */
export function themeQuery(): Record<string, string> {
  return { theme: JSON.stringify(themePayload()) };
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
  return shellTheme(id).mode;
}
