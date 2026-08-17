/**
 * Installer for the bundled deepwharf-companion dsh plugin.
 *
 * The companion is a dual-face cordis package (host stub + browser bundle)
 * shipped inside the app's resources. It is copied into the web profile's
 * node_modules — the loader's documented two-anchor resolution path — and
 * mounted through the same cordis.patch.yml managed block the MCP manager
 * uses. Everything here is idempotent and best-effort: a failure only costs
 * the shell-driven web UI themes and the usage line, never the app.
 *
 * Changes take effect on the next harness start; a running harness is never
 * restarted (that would kill live sessions).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PluginStoreContext } from "./plugin-store";
import { appendGroup, readPatchFile, removeGroup, splitManaged, withManaged, writePatchFile } from "./cordis-patch";

const PKG_NAME = "deepwharf-companion";
const PATCH_GROUP = "companion";

/** Bundled plugin source (inside the ASAR in packaged builds). */
export function companionSourceDir(): string {
  return join(__dirname, "..", "..", "resources", "companion");
}

function packageVersion(dir: string): string | null {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : null;
  } catch {
    return null;
  }
}

/** Recursive copy with plain read/write calls so ASAR sources work. */
function copyTree(src: string, dest: string): void {
  const st = statSync(src);
  if (st.isDirectory()) {
    mkdirSync(dest, { recursive: true });
    for (const entry of readdirSync(src)) copyTree(join(src, entry), join(dest, entry));
    return;
  }
  mkdirSync(join(dest, ".."), { recursive: true });
  writeFileSync(dest, readFileSync(src));
}

function installDir(dshHome: string): string {
  return join(dshHome, "profiles", "web", "node_modules", PKG_NAME);
}

/** The insert entry that mounts the package in the composed plugin tree. */
function companionPatchYaml(): string {
  return ["- insert:", `  - id: ${PKG_NAME}`, `    name: ${PKG_NAME}`, "    config: {}"].join("\n");
}

export interface CompanionInstallResult {
  installed: boolean;
  /** True when files or the patch entry changed (effective next harness start). */
  changed: boolean;
  reason?: string;
}

/**
 * Ensure the companion is present in the profile and mounted. Safe to call on
 * every boot: a matching version + patch entry is a no-op.
 */
export function ensureCompanion(ctx: PluginStoreContext): CompanionInstallResult {
  const src = companionSourceDir();
  if (!existsSync(join(src, "package.json"))) {
    return { installed: false, changed: false, reason: "bundled companion missing" };
  }
  const dest = installDir(ctx.dshHome);
  let changed = false;

  const srcVersion = packageVersion(src) ?? "0";
  const destVersion = packageVersion(dest);
  if (destVersion !== srcVersion || !existsSync(join(dest, "lib", "client.js"))) {
    try {
      rmSync(dest, { force: true, recursive: true, maxRetries: 2, retryDelay: 200 });
      copyTree(src, dest);
      changed = true;
      ctx.log(`companion installed: v${srcVersion} -> ${dest}`);
    } catch (err) {
      ctx.log(`companion copy failed: ${String(err)}`);
      if (!existsSync(join(dest, "lib", "client.js"))) {
        return { installed: false, changed: false, reason: String(err) };
      }
    }
  }

  try {
    const patchPath = join(ctx.dshHome, "cordis.patch.yml");
    const text = readPatchFile(patchPath);
    const { before, body, after } = splitManaged(text);
    const hasGroup = body.includes(`# group: ${PATCH_GROUP}`);
    if (!hasGroup) {
      const next = appendGroup(body, PATCH_GROUP, companionPatchYaml());
      writePatchFile(patchPath, withManaged(before, next, after));
      changed = true;
      ctx.log(`companion patch entry added (${patchPath})`);
    }
  } catch (err) {
    ctx.log(`companion patch entry failed: ${String(err)}`);
    return { installed: true, changed, reason: String(err) };
  }

  return { installed: true, changed };
}

/** Remove the companion (used by tests / manual cleanup). */
export function uninstallCompanion(ctx: PluginStoreContext): void {
  try {
    rmSync(installDir(ctx.dshHome), { force: true, recursive: true });
    const patchPath = join(ctx.dshHome, "cordis.patch.yml");
    const { before, body, after } = splitManaged(readPatchFile(patchPath));
    writePatchFile(patchPath, withManaged(before, removeGroup(body, PATCH_GROUP), after));
  } catch {
    // best effort
  }
}
