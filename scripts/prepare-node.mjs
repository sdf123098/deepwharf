// Download the embedded Node.js runtime (+ npm + pnpm) into resources/runtime.
// Usage: node scripts/prepare-node.mjs [nodeVersion]   (default: 24.19.0)
import { execSync } from "node:child_process";
import { mkdirSync, copyFileSync, cpSync, existsSync, rmSync, writeFileSync } from "node:fs";
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

const zipUrl = `${MIRROR}/v${VER}/node-v${VER}-win-x64.zip`;
const zipPath = join(tmp, "node.zip");
console.log("downloading", zipUrl);
execSync(`curl -sL --retry 3 -o "${zipPath}" "${zipUrl}"`, { stdio: "inherit" });
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
console.log("runtime ready:", RUNTIME);
