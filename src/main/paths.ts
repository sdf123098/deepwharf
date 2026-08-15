import { app } from "electron";
import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { semverGt } from "./pure";

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

/**
 * Locate `@deepseek-ai/dsh` installed through npx in the npm cache, preferring
 * the highest semver version over the newest mtime (mtime is unreliable — a
 * failed or copied cache entry can look newest).
 */
function findNpxHarnessEntry(): string | null {
  const cacheRoot = join(process.env.LOCALAPPDATA || "", "npm-cache", "_npx");
  if (!existsSync(cacheRoot)) return null;

  let best: { path: string; version: string | null } | null = null;
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
    if (!existsSync(entry)) continue;
    let version: string | null = null;
    try {
      const pkgJson = join(cacheRoot, dir, "node_modules", "@deepseek-ai", "dsh", "package.json");
      version = JSON.parse(readFileSync(pkgJson, "utf8")).version ?? null;
    } catch {
      // unreadable manifest — fall back to mtime tie-break below
    }
    if (
      !best ||
      (version && (!best.version || semverGt(version, best.version))) ||
      (!version && !best.version && statSync(entry).mtimeMs > statSync(best.path).mtimeMs)
    ) {
      best = { path: entry, version };
    }
  }
  return best?.path ?? null;
}
