// Custom Windows code-signing hook for electron-builder.
//
// Wired up in electron-builder.yml under `win.signtoolOptions.sign`:
// electron-builder requires this module and calls its `sign` export for every
// Windows artifact (app exe, NSIS installer, uninstaller, ...). The hook is
// invoked even when no CSC_LINK is set, so signing works out of the box.
//
// Mode selection — DEEPMHARF_SIGN_MODE (default: `test` when CSC_LINK is unset,
// otherwise `pfx`):
//   test    sign with the local self-signed test chain
//           (deepwharf-leaf.pfx in D:\Tools\数字签名工具\DeepWharf) — no CA,
//           no network; good for internal builds. This machine's Trusted Root
//           store already contains the test CA, so signatures verify as Valid.
//   pfx     sign with a real certificate given via CSC_LINK (path, file:// URL
//           or base64) + CSC_KEY_PASSWORD — works with any commercial CA pfx.
//   sigpath sign via the SignPath Foundation pipeline: runs the command in
//           DEEPMHARF_SIGPATH_CMD with {file} replaced by the artifact path.
//   none    skip signing (unsigned build).
//
// Timestamping is best-effort: it tries DEEPMHARF_TIMESTAMP_SERVER (default
// http://timestamp.digicert.com) first and falls back to an untimestamped
// signature if the server is unreachable.

"use strict";

const { spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");

const MODE =
  process.env.DEEPMHARF_SIGN_MODE || (process.env.CSC_LINK ? "pfx" : "test");
const TEST_PFX =
  process.env.DEEPMHARF_TEST_PFX ||
  "D:\\Tools\\数字签名工具\\DeepWharf\\deepwharf-leaf.pfx";
const TEST_PFX_PASSWORD = process.env.DEEPMHARF_TEST_PFX_PASSWORD || "deepwharf";
const TIMESTAMP_SERVER =
  process.env.DEEPMHARF_TIMESTAMP_SERVER || "http://timestamp.digicert.com";

/** Run a PowerShell expression and return { status, error } (error = stderr tail). */
function runPowershell(psScript) {
  const encoded = Buffer.from(psScript, "utf16le").toString("base64");
  const r = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
    { encoding: "utf8", windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  const stderr = (r.stderr || "").trim();
  const stdout = (r.stdout || "").trim();
  return { status: r.status, stdout, error: stderr || (r.status !== 0 ? stdout : "") };
}

function psSignScript(file, pfx, password, timestampServer) {
  const fileJson = JSON.stringify(file);
  const pfxJson = JSON.stringify(pfx);
  const pwdJson = JSON.stringify(password);
  const ts = timestampServer ? ` -TimestampServer ${JSON.stringify(timestampServer)}` : "";
  return `
$ErrorActionPreference = "Stop"
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(
  ${pfxJson}, ${pwdJson},
  [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable)
$sig = Set-AuthenticodeSignature -FilePath ${fileJson} -Certificate $cert -HashAlgorithm SHA256${ts}
if ($sig.Status -ne "Valid" -and $sig.Status -ne "NotTrusted") {
  throw "Set-AuthenticodeSignature failed: " + $sig.Status + " " + $sig.StatusMessage
}
Write-Output ("signed: " + $sig.SignerCertificate.Subject)
`;
}

function signWithPfx(file, pfx, password) {
  if (!pfx) {
    throw new Error(
      `sign: no PFX available for mode "${MODE}" — set DEEPMHARF_SIGN_MODE=none to skip signing, ` +
        "or provide a certificate (CSC_LINK for pfx mode).",
    );
  }
  if (!existsSync(pfx)) {
    throw new Error(`sign: certificate file not found: ${pfx}`);
  }
  // Timestamp is best-effort: some build networks cannot reach the timestamp
  // server, and an untimestamped signature still works locally.
  let r = runPowershell(psSignScript(file, pfx, password, TIMESTAMP_SERVER));
  if (r.status !== 0) {
    r = runPowershell(psSignScript(file, pfx, password, null));
    if (r.status === 0) {
      console.log("sign: timestamp server unreachable, signed without timestamp");
    }
  }
  if (r.status !== 0) {
    throw new Error(`sign: PowerShell Set-AuthenticodeSignature failed:\n${r.error}`);
  }
  console.log(`sign: ${r.stdout}`);
}

function signWithSignPath(file) {
  const cmd = process.env.DEEPMHARF_SIGPATH_CMD;
  if (!cmd) {
    throw new Error(
      'sign: DEEPMHARF_SIGN_MODE=sigpath requires DEEPMHARF_SIGPATH_CMD (a command template ' +
        'that replaces {file} with the artifact path, e.g. your signpath-cli / SignPath ' +
        'PowerShell wrapper). Request access at https://signpath.org first.',
    );
  }
  const full = cmd.split("{file}").join(JSON.stringify(file));
  console.log(`sign: running SignPath command: ${full}`);
  const r = spawnSync(full, { shell: true, windowsHide: true, stdio: "inherit" });
  if (r.status !== 0) {
    throw new Error(`sign: SignPath signing failed (exit ${r.status})`);
  }
}

module.exports.sign = async function sign(config) {
  const file = config.path;
  if (!file) {
    throw new Error("sign: no file path in signing config");
  }
  if (!existsSync(file)) {
    throw new Error(`sign: file to sign not found: ${file}`);
  }

  if (MODE === "none") {
    console.log(`sign: skipping ${file} (DEEPMHARF_SIGN_MODE=none)`);
    return;
  }

  if (MODE === "sigpath") {
    signWithSignPath(file);
    return;
  }

  // test / pfx — sign locally with a PFX via PowerShell Set-AuthenticodeSignature.
  if (MODE === "pfx") {
    // electron-builder already resolved CSC_LINK (including base64 decoding)
    // into config.cscInfo.file.
    const pfx = config.cscInfo?.file || process.env.CSC_LINK || process.env.WIN_CSC_LINK;
    const password =
      process.env.CSC_KEY_PASSWORD || process.env.WIN_CSC_KEY_PASSWORD || "";
    const pfxPath = pfx && pfx.startsWith("file://") ? new URL(pfx).pathname : pfx;
    signWithPfx(file, pfxPath, password);
    return;
  }

  if (MODE !== "test") {
    throw new Error(
      `sign: unknown DEEPMHARF_SIGN_MODE "${MODE}" (expected test | pfx | sigpath | none)`,
    );
  }
  signWithPfx(file, TEST_PFX, TEST_PFX_PASSWORD);
};
