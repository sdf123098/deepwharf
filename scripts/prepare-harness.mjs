// Vendor the DeepSeek Harness runtime into resources/harness, then prune it.
// Usage: node scripts/prepare-harness.mjs [dshVersion]
// A pinned version is required — "latest" is not reproducible and is refused.
// Without an argument the currently vendored version is re-vendored.
import { execSync } from "node:child_process";
import { mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const HARNESS = join(ROOT, "resources", "harness");
const NODE = join(ROOT, "resources", "runtime", "node.exe");
const NPM = join(ROOT, "resources", "runtime", "npm", "bin", "npm-cli.js");
const REG = process.env.NPM_REGISTRY || "https://registry.npmmirror.com";

/** The version currently vendored under resources/harness (null if absent). */
function vendoredVersion() {
  try {
    const pkgJson = join(HARNESS, "node_modules", "@deepseek-ai", "dsh", "package.json");
    return JSON.parse(readFileSync(pkgJson, "utf8")).version ?? null;
  } catch {
    return null;
  }
}

let VER = process.argv[2] || process.env.DSH_VERSION || null;
if (!VER) {
  VER = vendoredVersion(); // re-vendor the same version that is already bundled
}
if (!VER || VER === "latest") {
  throw new Error(
    "pinned dsh version required: pass <version> or set DSH_VERSION (latest is not reproducible)",
  );
}

rmSync(HARNESS, { recursive: true, force: true });
mkdirSync(HARNESS, { recursive: true });

const spec = `@deepseek-ai/dsh@${VER}`;
console.log("installing", spec, "into resources/harness …");
execSync(
  `"${NODE}" "${NPM}" install ${spec} --prefix "${HARNESS}" --registry "${REG}" --no-audit --no-fund --loglevel=error`,
  { stdio: "inherit" },
);

console.log("pruning…");
execSync(`"${process.execPath}" "${join(__dirname, "prune-harness.mjs")}"`, { stdio: "inherit" });

// Record the pinned version so a release build is reproducible.
const versionsPath = join(ROOT, "build-versions.json");
let versions = {};
try {
  versions = JSON.parse(readFileSync(versionsPath, "utf8"));
} catch {
  // first write
}
writeFileSync(versionsPath, JSON.stringify({ ...versions, harness: VER }, null, 2));

console.log("harness ready:", HARNESS);
