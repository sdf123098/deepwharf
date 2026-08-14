// Pack the pruned Harness node_modules into a single archive (resources/harness.zip)
// so the installer ships ONE file instead of ~11k. The app extracts it on first run.
import { execSync } from "node:child_process";
import { existsSync, rmSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const HARNESS = join(ROOT, "resources", "harness");
const OUT = join(ROOT, "resources", "harness.zip");
const TAR = "C:\\Windows\\System32\\tar.exe";

if (!existsSync(join(HARNESS, "node_modules"))) {
  console.error("resources/harness/node_modules missing — run prepare:harness first");
  process.exit(1);
}
rmSync(OUT, { force: true });
console.log("packing harness.zip …");
execSync(`"${TAR}" -a -cf "${OUT}" -C "${HARNESS}" node_modules`, { stdio: "inherit" });
console.log("harness.zip:", (statSync(OUT).size / 1e6).toFixed(1), "MB");
