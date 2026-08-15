import { app } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface DesktopSettings {
  // Harness (dsh) updates
  autoCheckUpdates: boolean;
  lastUpdateCheck: number;
  // Shell (desktop) updates
  autoCheckShell: boolean;
  lastShellCheck: number;
  // Appearance / behavior
  language: "auto" | "zh-CN" | "en-US";
  theme: "auto" | "light" | "dark";
  devtoolsOnStart: boolean;
}

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

const THEMES = ["auto", "light", "dark"] as const;
const LANGUAGES = ["auto", "zh-CN", "en-US"] as const;

/**
 * IPC is a runtime boundary: only accept the fields DesktopSettings knows,
 * each with the right type. Unknown fields and bad values are dropped.
 */
export function sanitizeSettingsPatch(input: unknown): Partial<DesktopSettings> {
  if (!input || typeof input !== "object") return {};
  const o = input as Record<string, unknown>;
  const patch: Partial<DesktopSettings> = {};
  if (typeof o.autoCheckUpdates === "boolean") patch.autoCheckUpdates = o.autoCheckUpdates;
  if (typeof o.autoCheckShell === "boolean") patch.autoCheckShell = o.autoCheckShell;
  if (typeof o.devtoolsOnStart === "boolean") patch.devtoolsOnStart = o.devtoolsOnStart;
  if (typeof o.lastUpdateCheck === "number") patch.lastUpdateCheck = o.lastUpdateCheck;
  if (typeof o.lastShellCheck === "number") patch.lastShellCheck = o.lastShellCheck;
  if (typeof o.language === "string" && (LANGUAGES as readonly string[]).includes(o.language)) {
    patch.language = o.language as DesktopSettings["language"];
  }
  if (typeof o.theme === "string" && (THEMES as readonly string[]).includes(o.theme)) {
    patch.theme = o.theme as DesktopSettings["theme"];
  }
  return patch;
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
