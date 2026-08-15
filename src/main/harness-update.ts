import { spawn } from "node:child_process";
import { existsSync, readFileSync, renameSync, rmSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { app } from "electron";
import { semverGt, resolveTargetModules } from "./pure";
import { pruneHarness } from "./harness-prune";

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

function npmCliPath(): string {
  return join(process.resourcesPath, "runtime", "npm", "bin", "npm-cli.js");
}

/**
 * Download + install the new harness into a temp prefix (bundled npm), then
 * atomically swap it over `resources/harness/node_modules`.
 * The old copy is NOT deleted here — the caller keeps it until the new
 * version passes its readiness check, then calls commit() (or rollback()).
 * The swapped-in tree is re-pruned so an online update does not bring back
 * sources/maps/docs that the initial package stripped.
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
    const appendStderr = (c: Buffer) => {
      stderr += c.toString();
      if (stderr.length > 64 * 1024) stderr = stderr.slice(-64 * 1024);
    };
    child.stderr.on("data", appendStderr);
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
  try {
    const pruned = await pruneHarness(dirname(targetModules));
    log(`harness pruned after update: ${pruned.files} files, ${pruned.dirs} dirs`);
  } catch (err) {
    log(`harness prune after update failed: ${String(err)}`);
  }
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
