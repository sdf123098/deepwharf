import { app } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DesktopSettings } from "./pure";
export type { DesktopSettings } from "./pure";
export { sanitizeSettingsPatch } from "./pure";

const DEFAULTS: DesktopSettings = {
  autoCheckUpdates: true,
  lastUpdateCheck: 0,
  autoCheckShell: true,
  lastShellCheck: 0,
  language: "auto",
  theme: "auto",
  devtoolsOnStart: false,
};

export function settingsPath(): string {
  return join(app.getPath("userData"), "desktop.json");
}

export function readSettings(): DesktopSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(settingsPath(), "utf8")) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeSettings(s: DesktopSettings): void {
  try {
    writeFileSync(settingsPath(), JSON.stringify(s, null, 2));
  } catch {
    // non-fatal
  }
}

export function updateSettings(patch: Partial<DesktopSettings>): DesktopSettings {
  const next = { ...readSettings(), ...patch };
  writeSettings(next);
  return next;
}

/** Resolve the UI language: saved override, else the OS locale. */
export function effectiveLanguage(): "zh-CN" | "en-US" {
  const lang = readSettings().language;
  if (lang !== "auto") return lang;
  return app.getLocale().startsWith("zh") ? "zh-CN" : "en-US";
}
