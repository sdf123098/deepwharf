// Vendor the DeepSeek Harness runtime into resources/harness, then prune it.
// Usage: node scripts/prepare-harness.mjs [dshVersion]   (default: latest)
import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const HARNESS = join(ROOT, "resources", "harness");
const NODE = join(ROOT, "resources", "runtime", "node.exe");
const NPM = join(ROOT, "resources", "runtime", "npm", "bin", "npm-cli.js");
const REG = process.env.NPM_REGISTRY || "https://registry.npmmirror.com";
const VER = process.argv[2] || process.env.DSH_VERSION || "latest";

rmSync(HARNESS, { recursive: true, force: true });
mkdirSync(HARNESS, { recursive: true });

const spec = VER === "latest" ? "@deepseek-ai/dsh" : `@deepseek-ai/dsh@${VER}`;
console.log("installing", spec, "into resources/harness …");
execSync(
  `"${NODE}" "${NPM}" install ${spec} --prefix "${HARNESS}" --registry "${REG}" --no-audit --no-fund --loglevel=error`,
  { stdio: "inherit" },
);

console.log("pruning…");
execSync(`"${process.execPath}" "${join(__dirname, "prune-harness.mjs")}"`, { stdio: "inherit" });
console.log("harness ready:", HARNESS);
