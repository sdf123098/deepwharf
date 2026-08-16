/**
 * Managed-block editing for $DSH_HOME/cordis.patch.yml, plus a parser for
 * `dsh --profile web --dump-config` output.
 *
 * The patch file is the official user override layer of the harness profile.
 * The harness's own skin manager already writes an "auto-generated; do not
 * edit" block into it, so we follow the same text-level convention: everything
 * outside our marked block (user entries, plugin blocks, comments) survives
 * byte-for-byte; our block is regenerated from group units.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const MANAGED_BEGIN = "# --- deepwharf managed (auto-generated; do not edit) ---";
export const MANAGED_END = "# --- end deepwharf managed ---";

// --- managed block text ops (pure) ----------------------------------------------

export interface SplitResult {
  before: string;
  body: string;
  after: string;
}

/** Split patch text into [before, managedBody, after]; missing block = empty body. */
export function splitManaged(text: string): SplitResult {
  const lines = text.split("\n");
  const begin = lines.findIndex((l) => l.trim() === MANAGED_BEGIN);
  if (begin === -1) return { before: text, body: "", after: "" };
  const end = lines.findIndex((l, i) => i > begin && l.trim() === MANAGED_END);
  if (end === -1) {
    // unterminated block: treat the rest as the body rather than losing data
    return { before: lines.slice(0, begin).join("\n"), body: lines.slice(begin + 1).join("\n"), after: "" };
  }
  return {
    before: lines.slice(0, begin).join("\n"),
    body: lines.slice(begin + 1, end).join("\n"),
    after: lines.slice(end + 1).join("\n"),
  };
}

/** Reassemble the patch text around (possibly empty) managed body. */
export function withManaged(before: string, body: string, after: string): string {
  const trimmedBody = body.replace(/^\n+|\n+$/g, "");
  const parts = [before.replace(/\n+$/, "")];
  if (trimmedBody !== "") {
    parts.push("", MANAGED_BEGIN, trimmedBody, MANAGED_END);
  }
  const out = parts.join("\n") + (after.startsWith("\n") || after === "" ? "\n" : "\n" + after);
  return out.replace(/\n{3,}/g, "\n\n");
}

/**
 * Groups are `# group: <key>` comment headers followed by YAML items. Removing
 * by key and appending keeps every other group (and hand edits between groups)
 * intact.
 */
export function removeGroup(body: string, key: string): string {
  const lines = body.split("\n");
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (line.trim() === `# group: ${key}`) {
      skipping = true;
      // also drop one blank line before the header we are removing
      if (out.length > 0 && out[out.length - 1].trim() === "") out.pop();
      continue;
    }
    if (skipping) {
      // next group header or non-indented content ends the group
      if (line.trim().startsWith("# group: ") || (line.trim() !== "" && !/^\s|-/.test(line))) {
        skipping = false;
      } else {
        continue;
      }
    }
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

export function appendGroup(body: string, key: string, yaml: string): string {
  const base = body.replace(/\n+$/, "");
  const group = `# group: ${key}\n${yaml.replace(/^\n+|\n+$/g, "")}`;
  return base === "" ? group : `${base}\n\n${group}`;
}

// --- YAML rendering helpers (pure) ----------------------------------------------

/** Quote a scalar for YAML output; plain when safe, single-quoted otherwise. */
export function yamlScalar(value: string): string {
  if (value === "") return "''";
  if (/^[A-Za-z0-9_./\\:@+-]+$/.test(value) && !/^\s|\s$/.test(value)) return value;
  return `'${value.replaceAll("'", "''")}'`;
}

export interface McpServerInput {
  serverName: string;
  transport: "stdio" | "streamable-http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

/** Render one `insert:` patch item that appends a new mcp-client entry. */
export function renderMcpInsert(server: McpServerInput): string {
  const id = `mcp-${server.serverName}`;
  const lines = [
    "- insert:",
    `  - id: ${yamlScalar(id)}`,
    "    name: '@deepseek-ai/dsh-mcp-client'",
    "    config:",
    `      transport: ${server.transport}`,
    `      serverName: ${yamlScalar(server.serverName)}`,
  ];
  if (server.transport === "stdio") {
    lines.push(`      command: ${yamlScalar(server.command ?? "")}`);
    if (server.args && server.args.length > 0) {
      lines.push("      args:");
      for (const a of server.args) lines.push(`      - ${yamlScalar(a)}`);
    } else {
      lines.push("      args: []");
    }
    const env = Object.entries(server.env ?? {});
    if (env.length > 0) {
      lines.push("      env:");
      for (const [k, v] of env) lines.push(`        ${yamlScalar(k)}: ${yamlScalar(v)}`);
    }
  } else {
    lines.push(`      url: ${yamlScalar(server.url ?? "")}`);
    const headers = Object.entries(server.headers ?? {});
    if (headers.length > 0) {
      lines.push("      headers:");
      for (const [k, v] of headers) lines.push(`        ${yamlScalar(k)}: ${yamlScalar(v)}`);
    }
  }
  return lines.join("\n");
}

// --- dump-config parsing (pure) ---------------------------------------------------

export interface DumpEntry {
  id: string;
  name: string;
  disabled: boolean;
  bundles: string[];
  serverName?: string;
  transport?: string;
  command?: string;
  url?: string;
  argsCount: number;
}

export interface DumpParseResult {
  entries: DumpEntry[];
  /** bundle name -> ids of entries its section contributed */
  bundleIds: Map<string, string[]>;
}

/**
 * Tolerant line parser for the dump's simple YAML shape. We extract id/name/
 * disabled plus one level of mcp-relevant config scalars; anything unexpected
 * is ignored rather than fatal.
 */
export function parseDumpConfig(stdout: string): DumpParseResult {
  const entries: DumpEntry[] = [];
  const bundleIds = new Map<string, string[]>();
  let current: DumpEntry | null = null;
  let lastBundle: string | null = null;
  let inArgs = false;
  for (const raw of stdout.split("\n")) {
    const line = raw.replace(/\r$/, "");
    const section = /^# == (.+)$/.exec(line.trim());
    if (section) {
      // "# == bundleA, patched by bundleB" — credit the primary bundle only
      lastBundle = section[1].split(",")[0].trim();
      bundleIds.set(lastBundle, bundleIds.get(lastBundle) ?? []);
      current = null;
      inArgs = false;
      continue;
    }
    if (/^- id: /.test(line)) {
      const id = line.replace(/^- id: /, "").trim().replace(/^'(.*)'$/, "$1");
      current = { id, name: "", disabled: false, bundles: lastBundle ? [lastBundle] : [], argsCount: 0 };
      entries.push(current);
      if (lastBundle) bundleIds.get(lastBundle)?.push(id);
      inArgs = false;
      continue;
    }
    if (!current) continue;
    const t = line.trim();
    const indent = line.length - line.replace(/^ +/, "").length;
    if (indent === 2 && t.startsWith("name: ")) current.name = t.slice(6).replace(/^'(.*)'$/, "$1");
    else if (indent === 2 && t === "disabled: true") current.disabled = true;
    else if (indent === 4 && t.startsWith("serverName: ")) current.serverName = t.slice(12).replace(/^'(.*)'$/, "$1");
    else if (indent === 4 && t.startsWith("transport: ")) current.transport = t.slice(11);
    else if (indent === 4 && t.startsWith("command: ")) current.command = t.slice(9).replace(/^'(.*)'$/, "$1");
    else if (indent === 4 && t.startsWith("url: ")) current.url = t.slice(5).replace(/^'(.*)'$/, "$1");
    else if (indent === 4 && t === "args:") inArgs = true;
    else if (inArgs && indent === 6 && t.startsWith("- ")) current.argsCount++;
    else if (indent > 0 && indent !== 6) inArgs = false;
  }
  return { entries, bundleIds };
}

// --- file + process plumbing --------------------------------------------------

export function readPatchFile(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

export function writePatchFile(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, "utf8");
}

/** Run `dsh --profile web --dump-config` and capture its composed tree. */
export function runDumpConfig(
  nodeExecutable: string,
  harnessEntry: string,
  dshHome: string,
): Promise<{ ok: boolean; stdout: string; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      nodeExecutable,
      [harnessEntry, "--profile", "web", "--dump-config"],
      { env: { ...process.env, DSH_HOME: dshHome }, windowsHide: true },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c: Buffer) => (stdout += c.toString()));
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
    child.on("error", (err) => resolve({ ok: false, stdout: "", error: String(err) }));
    child.on("exit", (code) => {
      // patch warnings go to stderr; a non-zero code with a full dump still parses
      if (code === 0 || stdout.includes("- id:")) resolve({ ok: true, stdout });
      else resolve({ ok: false, stdout, error: `exit ${code}: ${stderr.slice(0, 300)}` });
    });
  });
}
