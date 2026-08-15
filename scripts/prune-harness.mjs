// Prune the vendored Harness so the installer ships only what the runtime needs.
// Removes TypeScript sources, source maps, docs and non-Windows prebuilds.
// License / NOTICE files are always kept.
// Run after (re)installing the harness into resources/harness.
// Usage: node scripts/prune-harness.mjs [targetDir]   (default: resources/harness)
import { rmSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.argv[2]
  ? resolve(process.argv[2])
  : new URL("../resources/harness", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

const BAD_EXT = [".ts", ".mts", ".cts", ".map", ".md", ".markdown", ".cc", ".h", ".cpp"];
const BAD_DIR = ["test", "tests", "__tests__", "docs", "example", "examples", ".github", "demo", "benchmark", "benchmarks"];
const KEEP_LICENSE = /^(license|licence|notice|copying|copyright|third[-_ ]party)/i;

let removedFiles = 0;
let removedDirs = 0;

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (BAD_DIR.includes(e.name)) {
        rmSync(p, { recursive: true, force: true });
        removedDirs++;
        continue;
      }
      // drop non-Windows native prebuilds
      if (/prebuilds?|node_modules$/i.test(e.name) === false && /darwin|linux|arm64|android|ios/i.test(e.name)) {
        rmSync(p, { recursive: true, force: true });
        removedDirs++;
        continue;
      }
      walk(p);
    } else {
      // license texts must survive pruning
      if (KEEP_LICENSE.test(e.name)) continue;
      const lower = e.name.toLowerCase();
      if (BAD_EXT.some((x) => lower.endsWith(x))) {
        rmSync(p, { force: true });
        removedFiles++;
      } else if (/-(darwin|linux|arm64)\./.test(lower) || /darwin|linux/.test(lower) && lower.endsWith(".node")) {
        rmSync(p, { force: true });
        removedFiles++;
      }
    }
  }
}

if (!existsSync(ROOT)) {
  console.error(`prune: target not found: ${ROOT}`);
  process.exit(1);
}
walk(ROOT);
console.log(`pruned ${removedFiles} files, ${removedDirs} dirs (${ROOT})`);
