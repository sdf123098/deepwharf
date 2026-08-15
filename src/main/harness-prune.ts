/**
 * Runtime prune for the vendored Harness tree — mirrors scripts/prune-harness.mjs
 * so an online update strips the same files the initial package ships without
 * (TypeScript sources, source maps, docs, non-Windows prebuilds).
 * License / NOTICE files are always kept.
 */
import { promises as fs } from "node:fs";
import { join } from "node:path";

const BAD_EXT = [".ts", ".mts", ".cts", ".map", ".md", ".markdown", ".cc", ".h", ".cpp"];
const BAD_DIR = [
  "test",
  "tests",
  "__tests__",
  "docs",
  "example",
  "examples",
  ".github",
  "demo",
  "benchmark",
  "benchmarks",
];
// License texts must survive pruning for third-party attribution.
const KEEP_LICENSE = /^(license|licence|notice|copying|copyright|third[-_ ]party)/i;

export interface PruneResult {
  files: number;
  dirs: number;
}

export async function pruneHarness(root: string): Promise<PruneResult> {
  const result: PruneResult = { files: 0, dirs: 0 };
  await walk(root, result);
  return result;
}

async function walk(dir: string, result: PruneResult): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (BAD_DIR.includes(e.name)) {
        await fs.rm(p, { recursive: true, force: true });
        result.dirs++;
        continue;
      }
      // drop non-Windows native prebuild directories
      if (
        !/prebuilds?|node_modules$/i.test(e.name) &&
        /darwin|linux|arm64|android|ios/i.test(e.name)
      ) {
        await fs.rm(p, { recursive: true, force: true });
        result.dirs++;
        continue;
      }
      await walk(p, result);
    } else {
      if (KEEP_LICENSE.test(e.name)) continue;
      const lower = e.name.toLowerCase();
      if (BAD_EXT.some((x) => lower.endsWith(x))) {
        await fs.rm(p, { force: true });
        result.files++;
      } else if (
        /-(darwin|linux|arm64)\./.test(lower) ||
        (/darwin|linux/.test(lower) && lower.endsWith(".node"))
      ) {
        await fs.rm(p, { force: true });
        result.files++;
      }
    }
  }
}
