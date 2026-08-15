// Download the embedded Node.js runtime (+ npm + pnpm) into resources/runtime.
// Usage: node scripts/prepare-node.mjs [nodeVersion]   (default: 24.19.0)
// Downloads are verified: node zip against SHASUMS256.txt, pnpm tgz against
// the registry's dist.integrity (SRI). Versions land in build-versions.json.
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, copyFileSync, cpSync, existsSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RUNTIME = join(ROOT, "resources", "runtime");
const VER = process.argv[2] || process.env.NODE_VERSION || "24.19.0";
const MIRROR = process.env.NODE_MIRROR || "https://npmmirror.com/mirrors/node";
const TAR = "C:\\Windows\\System32\\tar.exe";

const tmp = join(ROOT, ".tmp-node");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
mkdirSync(RUNTIME, { recursive: true });

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const zipUrl = `${MIRROR}/v${VER}/node-v${VER}-win-x64.zip`;
const zipPath = join(tmp, "node.zip");
console.log("downloading", zipUrl);
execSync(`curl -sL --retry 3 -o "${zipPath}" "${zipUrl}"`, { stdio: "inherit" });

// Verify the node zip against the official SHASUMS256.txt before extracting.
const sums = execSync(`curl -sL --retry 3 "${MIRROR}/v${VER}/SHASUMS256.txt"`, { encoding: "utf8" });
const want = sums
  .split("\n")
  .find((l) => l.includes(`node-v${VER}-win-x64.zip`))
  ?.split(/\s+/)[0];
if (!want) throw new Error(`no SHA256 entry for node-v${VER}-win-x64.zip in SHASUMS256.txt`);
const got = sha256File(zipPath);
if (got.toLowerCase() !== want.toLowerCase()) {
  throw new Error(`node zip checksum mismatch: got ${got}, want ${want}`);
}
console.log("node zip sha256 verified");

console.log("extracting…");
execSync(`"${TAR}" -xf "${zipPath}" -C "${tmp}"`, { stdio: "inherit" });

const src = join(tmp, `node-v${VER}-win-x64`);
copyFileSync(join(src, "node.exe"), join(RUNTIME, "node.exe"));
cpSync(join(src, "node_modules", "npm"), join(RUNTIME, "npm"), { recursive: true });

// pnpm (needed by the plugin store -> `dsh plugin` forwards to pnpm)
const PNPM_VER = process.env.PNPM_VERSION || "10.12.1";
const pnpmUrl = `https://registry.npmmirror.com/pnpm/-/pnpm-${PNPM_VER}.tgz`;
const pnpmTgz = join(tmp, "pnpm.tgz");
console.log("downloading pnpm", PNPM_VER);
execSync(`curl -sL --retry 3 -o "${pnpmTgz}" "${pnpmUrl}"`, { stdio: "inherit" });

// Verify the pnpm tarball against the registry's SRI integrity hash.
const pnpmMeta = JSON.parse(
  execSync(`curl -sL --retry 3 "https://registry.npmmirror.com/pnpm/${PNPM_VER}"`, { encoding: "utf8" }),
);
const integrity = pnpmMeta?.dist?.integrity;
if (!integrity) throw new Error(`no dist.integrity for pnpm@${PNPM_VER}`);
const [algo, expected] = integrity.split("-");
const actual = createHash(algo).update(readFileSync(pnpmTgz)).digest("base64");
if (actual !== expected) {
  throw new Error(`pnpm tarball integrity mismatch: got ${actual}, want ${expected}`);
}
console.log("pnpm tarball integrity verified");

execSync(`"${TAR}" -xzf "${pnpmTgz}" -C "${tmp}"`, { stdio: "inherit" });
const pnpmDir = join(RUNTIME, "pnpm");
mkdirSync(pnpmDir, { recursive: true });
cpSync(join(tmp, "package", "bin"), join(pnpmDir, "bin"), { recursive: true });
cpSync(join(tmp, "package", "dist"), join(pnpmDir, "dist"), { recursive: true });
writeFileSync(
  join(pnpmDir, "pnpm.cmd"),
  '@echo off\r\nSETLOCAL\r\nfor %%I in ("%~dp0..") do set "RUNTIME_DIR=%%~fI"\r\n"%RUNTIME_DIR%\\node.exe" "%~dp0bin\\pnpm.cjs" %*\r\n',
);

rmSync(tmp, { recursive: true, force: true });

// Record the pinned versions so a release build is reproducible.
const versionsPath = join(ROOT, "build-versions.json");
let versions = {};
try {
  versions = JSON.parse(readFileSync(versionsPath, "utf8"));
} catch {
  // first write
}
writeFileSync(versionsPath, JSON.stringify({ ...versions, node: VER, pnpm: PNPM_VER }, null, 2));

console.log("runtime ready:", RUNTIME);
