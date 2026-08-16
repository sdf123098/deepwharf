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
  theme: string;
  devtoolsOnStart: boolean;
  // Desktop integration
  closeToTray: boolean;
  globalShortcutEnabled: boolean;
  autoLaunch: boolean;
  notificationsEnabled: boolean;
  /** User dismissed the API-key onboarding; keep it from auto-opening again. */
  onboardingDismissed: boolean;
  // Per-window geometry, keyed by window id ("main", "settings", "store", "harnessSettings").
  windowBounds: Record<string, WindowBounds>;
}

/** A window's remembered position and size. Position is optional: stale or off-screen coords are dropped. */
export interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

/** Absolute floor for any remembered size; per-window minimums clamp at apply time. */
export const MIN_WINDOW_SIZE = { width: 400, height: 300 };

/**
 * Validate one remembered geometry entry. Width/height must be finite numbers
 * at or above the absolute floor; x/y must be finite numbers when present.
 * Anything else is rejected so a corrupt desktop.json never breaks window
 * creation.
 */
export function sanitizeWindowBounds(input: unknown): WindowBounds | undefined {
  if (!input || typeof input !== "object") return undefined;
  const o = input as Record<string, unknown>;
  const width = typeof o.width === "number" && Number.isFinite(o.width) ? Math.round(o.width) : NaN;
  const height = typeof o.height === "number" && Number.isFinite(o.height) ? Math.round(o.height) : NaN;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return undefined;
  if (width < MIN_WINDOW_SIZE.width || height < MIN_WINDOW_SIZE.height) return undefined;
  const out: WindowBounds = { width, height };
  if (typeof o.x === "number" && Number.isFinite(o.x)) out.x = Math.round(o.x);
  if (typeof o.y === "number" && Number.isFinite(o.y)) out.y = Math.round(o.y);
  return out;
}

const THEMES = ["auto", "light", "dark", "midnight", "forest", "warm", "contrast"] as const;

/** Shell theme palettes. Colors land as CSS variables (--bg, --panel, …) in
 * every shell window; `mode` drives nativeTheme so the embedded Harness web
 * UI follows the same light/dark base. */
export interface ShellTheme {
  id: string;
  mode: "light" | "dark";
  colors: {
    bg: string;
    panel: string;
    border: string;
    text: string;
    muted: string;
    accent: string;
  };
}

export const SHELL_THEMES: ShellTheme[] = [
  {
    id: "light",
    mode: "light",
    colors: { bg: "#ffffff", panel: "#f6f8fa", border: "#d0d7de", text: "#1f2328", muted: "#57606a", accent: "#0969da" },
  },
  {
    id: "dark",
    mode: "dark",
    colors: { bg: "#0d1117", panel: "#161b22", border: "#21262d", text: "#e6edf3", muted: "#8b949e", accent: "#4f8cff" },
  },
  {
    id: "midnight",
    mode: "dark",
    colors: { bg: "#0a1428", panel: "#101d36", border: "#1d2d4d", text: "#dbe7ff", muted: "#7f93b8", accent: "#5ba3f5" },
  },
  {
    id: "forest",
    mode: "dark",
    colors: { bg: "#0e1512", panel: "#14201a", border: "#223529", text: "#dcefe3", muted: "#7e9a88", accent: "#3fb950" },
  },
  {
    id: "warm",
    mode: "light",
    colors: { bg: "#faf5ec", panel: "#f3ead9", border: "#e2d5bd", text: "#33302a", muted: "#7c7364", accent: "#b4632a" },
  },
  {
    id: "contrast",
    mode: "light",
    colors: { bg: "#ffffff", panel: "#ffffff", border: "#000000", text: "#000000", muted: "#333333", accent: "#0000cd" },
  },
];

/** Concrete palette for a stored theme id; "auto" resolved by the caller. */
export function shellTheme(id: string): ShellTheme {
  return SHELL_THEMES.find((t) => t.id === id) ?? SHELL_THEMES[1];
}

const LANGUAGES = ["auto", "zh-CN", "en-US"] as const;

/** Standard semver comparison — handles rc/alpha/beta/build metadata correctly. */
export function semverGt(a: string, b: string): boolean {
  try {
    return semver.gt(a, b);
  } catch {
    return false; // an invalid version never compares greater
  }
}

// --- token usage helpers --------------------------------------------------------

/** The dsh-token-meter `tokenUsage` projection value (per-session totals). */
export interface TokenUsage {
  uncachedInputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** Validate a raw projection value as a TokenUsage; null when malformed. */
export function parseTokenUsage(v: unknown): TokenUsage | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const out: TokenUsage = { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  for (const key of Object.keys(out) as (keyof TokenUsage)[]) {
    const n = o[key];
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
    out[key] = n;
  }
  return out;
}

/** Share of prompt tokens served from cache; null before any input exists. */
export function cacheHitRate(u: TokenUsage): number | null {
  const input = u.cacheReadTokens + u.cacheWriteTokens + u.uncachedInputTokens;
  if (input <= 0) return null;
  return u.cacheReadTokens / input;
}

/** Context occupancy percent from a contextPressure projection value. */
export function contextPercent(pressure: unknown): number | null {
  if (!pressure || typeof pressure !== "object") return null;
  const o = pressure as Record<string, unknown>;
  const used = typeof o.projectedTokens === "number" ? o.projectedTokens : o.pressureTokens;
  const window = o.contextWindow;
  if (typeof used !== "number" || typeof window !== "number" || window <= 0 || used < 0) return null;
  return Math.min(1, used / window);
}

/** 1234 -> "1.2K", 1234567 -> "1.2M"; plain number below 1000. */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n < 1000) return String(Math.round(n));
  const units: Array<[number, string]> = [
    [1_000_000_000, "B"],
    [1_000_000, "M"],
    [1_000, "K"],
  ];
  for (const [size, suffix] of units) {
    if (n >= size) {
      const v = n / size;
      return (v >= 100 ? v.toFixed(0) : v.toFixed(1)) + suffix;
    }
  }
  return String(n);
}

// --- deepwharf:// deep links ----------------------------------------------------

export interface DeepLinkIntent {
  prompt?: string;
  cwd?: string;
}

const DEEP_LINK_MAX_PROMPT = 2000;
const DEEP_LINK_MAX_CWD = 260;

/**
 * Parse a deepwharf:// URL. Only `deepwharf://new?prompt=…&cwd=…` (and the bare
 * `deepwharf://` / `deepwharf://open` "just show me" forms) are recognized;
 * anything else returns null. Prompt and cwd are length-capped; cwd must look
 * like an absolute Windows path. The link NEVER auto-sends — the caller must
 * confirm with the user before creating a session.
 */
export function parseDeepLink(raw: string): DeepLinkIntent | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "deepwharf:") return null;
  if (u.host !== "new" && u.host !== "open" && u.host !== "") return null;
  const intent: DeepLinkIntent = {};
  const prompt = u.searchParams.get("prompt");
  if (prompt !== null && prompt !== "") {
    intent.prompt = prompt.slice(0, DEEP_LINK_MAX_PROMPT);
  }
  const cwd = u.searchParams.get("cwd");
  if (cwd !== null && cwd !== "" && /^[A-Za-z]:[\\/]/.test(cwd) && cwd.length <= DEEP_LINK_MAX_CWD) {
    intent.cwd = cwd;
  }
  return intent;
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
  if (typeof o.closeToTray === "boolean") patch.closeToTray = o.closeToTray;
  if (typeof o.globalShortcutEnabled === "boolean") {
    patch.globalShortcutEnabled = o.globalShortcutEnabled;
  }
  if (typeof o.autoLaunch === "boolean") patch.autoLaunch = o.autoLaunch;
  if (typeof o.notificationsEnabled === "boolean") patch.notificationsEnabled = o.notificationsEnabled;
  if (typeof o.onboardingDismissed === "boolean") patch.onboardingDismissed = o.onboardingDismissed;
  if (typeof o.lastUpdateCheck === "number") patch.lastUpdateCheck = o.lastUpdateCheck;
  if (typeof o.lastShellCheck === "number") patch.lastShellCheck = o.lastShellCheck;
  if (typeof o.language === "string" && (LANGUAGES as readonly string[]).includes(o.language)) {
    patch.language = o.language as DesktopSettings["language"];
  }
  if (typeof o.theme === "string" && (THEMES as readonly string[]).includes(o.theme)) {
    patch.theme = o.theme;
  }
  if (o.windowBounds && typeof o.windowBounds === "object" && !Array.isArray(o.windowBounds)) {
    const record: Record<string, WindowBounds> = {};
    for (const [key, value] of Object.entries(o.windowBounds as Record<string, unknown>)) {
      const bounds = sanitizeWindowBounds(value);
      if (bounds) record[key] = bounds;
    }
    if (Object.keys(record).length > 0) patch.windowBounds = record;
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
