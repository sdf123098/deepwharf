import { app } from "electron";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface ResolvedPaths {
  nodeExecutable: string;
  harnessEntry: string;
  dshHome: string;
  logsDir: string;
  desktopLog: string;
  harnessLog: string;
}

/**
 * Resolve every path the app needs.
 *
 * - Packaged: node.exe + harness come from `resources/` (extraResources, outside ASAR).
 * - Dev: system `node` on PATH + the dsh package found in the npm `_npx` cache,
 *   overridable via DSH_NODE_EXE / DSH_HARNESS_ENTRY.
 */
export function resolvePaths(): ResolvedPaths {
  const userData = app.getPath("userData");
  const dshHome = join(userData, "harness");
  const logsDir = join(userData, "logs");

  const nodeExecutable = app.isPackaged
    ? join(process.resourcesPath, "runtime", "node.exe")
    : process.env.DSH_NODE_EXE || "node";

  const harnessEntry = app.isPackaged
    ? join(process.resourcesPath, "harness", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js")
    : process.env.DSH_HARNESS_ENTRY || findNpxHarnessEntry();

  return {
    nodeExecutable,
    harnessEntry: harnessEntry ?? "",
    dshHome,
    logsDir,
    desktopLog: join(logsDir, "desktop.log"),
    harnessLog: join(logsDir, "harness.log"),
  };
}

/** Locate the newest `@deepseek-ai/dsh` installed through npx in the npm cache. */
function findNpxHarnessEntry(): string | null {
  const cacheRoot = join(process.env.LOCALAPPDATA || "", "npm-cache", "_npx");
  if (!existsSync(cacheRoot)) return null;

  let best: { path: string; mtime: number } | null = null;
  for (const dir of readdirSync(cacheRoot)) {
    const entry = join(
      cacheRoot,
      dir,
      "node_modules",
      "@deepseek-ai",
      "dsh",
      "lib",
      "bin.js",
    );
    if (existsSync(entry)) {
      const mtime = statSync(entry).mtimeMs;
      if (!best || mtime > best.mtime) best = { path: entry, mtime };
    }
  }
  return best?.path ?? null;
}
