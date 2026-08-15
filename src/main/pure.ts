/**
 * Pure helpers shared across the main process. This module must not import
 * Electron (or any other runtime-only dependency) so it can be unit-tested in
 * plain Node — see test/pure.test.cjs.
 */
import { dirname, basename } from "node:path";
import semver from "semver";

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

const THEMES = ["auto", "light", "dark"] as const;
const LANGUAGES = ["auto", "zh-CN", "en-US"] as const;

/** Standard semver comparison — handles rc/alpha/beta/build metadata correctly. */
export function semverGt(a: string, b: string): boolean {
  try {
    return semver.gt(a, b);
  } catch {
    return false; // an invalid version never compares greater
  }
}

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

/**
 * Resolve `resources/harness/node_modules` from the dsh entry point and assert
 * the layout matches what the updater expects before touching anything.
 *
 * harnessEntry = .../harness/node_modules/@deepseek-ai/dsh/lib/bin.js
 *   -> dshPackageDir = .../@deepseek-ai/dsh
 *   -> scopeDir      = .../@deepseek-ai
 *   -> target        = .../node_modules
 */
export function resolveTargetModules(harnessEntry: string): string {
  const dshPackageDir = dirname(dirname(harnessEntry));
  const scopeDir = dirname(dshPackageDir);
  const target = dirname(scopeDir);
  if (basename(target) !== "node_modules") {
    throw new Error(`unexpected harness layout: ${target}`);
  }
  return target;
}
