import { spawn } from "node:child_process";
import { existsSync, readFileSync, renameSync, rmSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { app } from "electron";

// Update source. registry.npmjs.org is unreachable from this network, so the
// default is the npmmirror registry (overridable via DSH_UPDATE_REGISTRY).
export const UPDATE_REGISTRY =
  process.env.DSH_UPDATE_REGISTRY || "https://registry.npmmirror.com";
const PKG = "@deepseek-ai/dsh";

export interface UpdateCheck {
  current: string | null;
  latest: string | null;
  updateAvailable: boolean;
}

/**
 * Result of a staged harness swap. The old copy is kept at `backup` until the
 * caller has verified the new version starts; only then should commit() be
 * called. rollback() restores the previous version over a broken new one.
 */
export interface HarnessUpdateTransaction {
  targetModules: string;
  backup: string;
  /** New version verified ready: drop the old copy. */
  commit: () => void;
  /** Restore the previous version over a broken new one. */
  rollback: () => void;
}

export function currentHarnessVersion(harnessEntry: string): string | null {
  try {
    // harnessEntry = .../@deepseek-ai/dsh/lib/bin.js -> package.json is two levels up.
    const pkgJson = join(dirname(dirname(harnessEntry)), "package.json");
    return JSON.parse(readFileSync(pkgJson, "utf8")).version ?? null;
  } catch {
    return null;
  }
}

/** Minimal semver compare that understands `0.1.0-rc.N` style versions. */
export function semverGt(a: string, b: string): boolean {
  const parse = (v: string) => {
    const [core, pre] = v.split("-");
    const nums = core.split(".").map((n) => parseInt(n, 10) || 0);
    const preNum = pre ? parseInt((pre.match(/\d+/) || ["0"])[0], 10) : Infinity;
    return { nums, preNum, hasPre: !!pre };
  };
  const A = parse(a);
  const B = parse(b);
  for (let i = 0; i < 3; i++) {
    if ((A.nums[i] || 0) !== (B.nums[i] || 0)) return (A.nums[i] || 0) > (B.nums[i] || 0);
  }
  // Same core version: a release beats a prerelease; higher rc beats lower rc.
  if (A.hasPre !== B.hasPre) return !A.hasPre;
  return A.preNum > B.preNum;
}

export async function checkForUpdate(harnessEntry: string): Promise<UpdateCheck> {
  const current = currentHarnessVersion(harnessEntry);
  const res = await fetch(`${UPDATE_REGISTRY}/${PKG}/latest`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`registry responded ${res.status}`);
  const meta = (await res.json()) as { version?: string };
  const latest = meta.version ?? null;
  return {
    current,
    latest,
    updateAvailable: !!current && !!latest && semverGt(latest, current),
  };
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
function resolveTargetModules(harnessEntry: string): string {
  const dshPackageDir = dirname(dirname(harnessEntry));
  const scopeDir = dirname(dshPackageDir);
  const target = dirname(scopeDir);
  if (basename(target) !== "node_modules") {
    throw new Error(`unexpected harness layout: ${target}`);
  }
  return target;
}

function npmCliPath(): string {
  return join(process.resourcesPath, "runtime", "npm", "bin", "npm-cli.js");
}

/**
 * Download + install the new harness into a temp prefix (bundled npm), then
 * atomically swap it over `resources/harness/node_modules`.
 * The old copy is NOT deleted here — the caller keeps it until the new
 * version passes its readiness check, then calls commit() (or rollback()).
 * Caller must have stopped the harness before invoking.
 */
export async function installHarnessUpdate(
  nodeExecutable: string,
  harnessEntry: string,
  version: string,
  log: (msg: string) => void,
): Promise<HarnessUpdateTransaction> {
  const tmpPrefix = join(app.getPath("userData"), "harness-update");
  rmSync(tmpPrefix, { recursive: true, force: true });
  mkdirSync(tmpPrefix, { recursive: true });

  log(`npm install ${PKG}@${version} -> ${tmpPrefix}`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      nodeExecutable,
      [
        npmCliPath(),
        "install",
        `${PKG}@${version}`,
        "--prefix",
        tmpPrefix,
        "--registry",
        UPDATE_REGISTRY,
        "--no-audit",
        "--no-fund",
        "--loglevel=error",
      ],
      { windowsHide: true, env: { ...process.env, npm_config_registry: UPDATE_REGISTRY } },
    );
    let stderr = "";
    child.stderr.on("data", (c) => (stderr += c));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`npm install failed (code ${code}): ${stderr.slice(0, 500)}`)),
    );
  });

  const newModules = join(tmpPrefix, "node_modules");
  const newEntry = join(newModules, "@deepseek-ai", "dsh", "lib", "bin.js");
  if (!existsSync(newEntry)) {
    throw new Error("update produced no harness entry");
  }

  const targetModules = resolveTargetModules(harnessEntry);
  if (!existsSync(targetModules)) {
    throw new Error(`harness node_modules not found at ${targetModules}`);
  }
  const backup = targetModules + ".old";
  log(`swap ${targetModules}`);
  rmSync(backup, { recursive: true, force: true });
  renameSync(targetModules, backup);
  try {
    renameSync(newModules, targetModules);
  } catch (err) {
    // restore on swap failure
    renameSync(backup, targetModules);
    throw err;
  }
  rmSync(tmpPrefix, { recursive: true, force: true });
  log("harness update installed (old copy kept until ready)");
  return {
    targetModules,
    backup,
    commit: () => rmSync(backup, { recursive: true, force: true }),
    rollback: () => {
      rmSync(targetModules, { recursive: true, force: true });
      if (existsSync(backup)) renameSync(backup, targetModules);
    },
  };
}
