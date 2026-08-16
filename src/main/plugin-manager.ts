/**
 * Plugin manager: three tabs over the official mechanisms.
 *
 *  - 插件 Plugins: profile dependencies via `dsh plugin` (pnpm forwarder) for
 *    update/uninstall, plus enable/disable through cordis.patch.yml's official
 *    `disabled` override on the entries a bundle contributes (dump-config
 *    gives the bundle → entries map).
 *  - MCP: mcp-client instances from the composed config (dump-config);
 *    add/remove/toggle through the patch file's insert/disable syntax.
 *  - 技能 Skills: the official `skill.list` RPC (needs a session id) plus the
 *    $DSH_HOME/skills folder.
 *
 * The patch file's non-managed content is never rewritten — the managed block
 * mirrors the convention the harness's own skin manager uses.
 */
import { ipcMain, BrowserWindow, shell } from "electron";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { localeForRenderer } from "./i18n";
import { rememberedWindowBounds, trackWindowBounds } from "./window";
import { themePayload, themeQuery } from "./theme";
import { runPnpmForward, type PluginStoreContext } from "./plugin-store";
import { harnessRpc } from "./harness-settings";
import {
  appendGroup,
  parseDumpConfig,
  readPatchFile,
  removeGroup,
  renderMcpInsert,
  runDumpConfig,
  splitManaged,
  withManaged,
  writePatchFile,
  type McpServerInput,
} from "./cordis-patch";

export type PluginKind = "inbox" | "layer" | "plain";

export interface InstalledPlugin {
  name: string;
  version: string;
  /** The spec recorded in the profile's dependencies (range or github:…). */
  spec: string;
  kind: PluginKind;
  /** Composed-config entry count this bundle contributes (0 = none found). */
  entryCount: number;
  /** True when every contributed entry is disabled in the composed tree. */
  disabled: boolean;
}

export interface McpServerView {
  id: string;
  serverName: string;
  transport: string;
  command?: string;
  url?: string;
  argsCount: number;
  disabled: boolean;
  /** True when the entry comes from our managed insert (removable). */
  ours: boolean;
}

const PKG_NAME_RE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const SERVER_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const MCP_CLIENT_PLUGIN = "@deepseek-ai/dsh-mcp-client";

function patchFilePath(ctx: PluginStoreContext): string {
  return join(ctx.dshHome, "cordis.patch.yml");
}

// --- dump + patch composition ---------------------------------------------------

async function dump(ctx: PluginStoreContext) {
  const r = await runDumpConfig(ctx.nodeExecutable, ctx.harnessEntry, ctx.dshHome);
  if (!r.ok) throw new Error(r.error || "dump-config failed");
  return parseDumpConfig(r.stdout);
}

/** Rewrite the managed block with one group swapped; everything else kept. */
function applyPatchGroup(
  ctx: PluginStoreContext,
  key: string,
  yaml: string | null, // null = remove the group
): void {
  const path = patchFilePath(ctx);
  const text = readPatchFile(path);
  const { before, body, after } = splitManaged(text);
  const next = yaml === null ? removeGroup(body, key) : appendGroup(removeGroup(body, key), key, yaml);
  writePatchFile(path, withManaged(before, next, after));
}

function managedHasGroup(ctx: PluginStoreContext, key: string): boolean {
  return splitManaged(readPatchFile(patchFilePath(ctx))).body.includes(`# group: ${key}`);
}

// --- plugin tab -------------------------------------------------------------------

function installedVersion(profileDir: string, name: string): string {
  try {
    const pkg = JSON.parse(readFileSync(join(profileDir, "node_modules", name, "package.json"), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "";
  } catch {
    return "";
  }
}

export function listPlugins(ctx: PluginStoreContext, bundleIds?: Map<string, string[]>, disabledIds?: Set<string>): InstalledPlugin[] {
  const profileDir = join(ctx.dshHome, "profiles", "web");
  let manifest: Record<string, unknown> = {};
  try {
    manifest = JSON.parse(readFileSync(join(profileDir, "package.json"), "utf8"));
  } catch {
    return [];
  }
  const deps = (manifest.dependencies ?? {}) as Record<string, string>;
  const dsh = manifest.dsh as { profile?: { bundles?: unknown[] } } | undefined;
  const bundles = Array.isArray(dsh?.profile?.bundles) ? (dsh!.profile!.bundles as unknown[]) : [];
  const bundleSet = new Set(bundles.filter((b): b is string => typeof b === "string"));
  const out: InstalledPlugin[] = [];
  const enrich = (base: Omit<InstalledPlugin, "entryCount" | "disabled">): InstalledPlugin => {
    const ids = bundleIds?.get(base.name) ?? [];
    return { ...base, entryCount: ids.length, disabled: ids.length > 0 && ids.every((id) => disabledIds?.has(id) === true) };
  };
  for (const name of bundleSet) {
    if (deps[name] !== undefined) continue; // shown below with actions
    out.push(enrich({ name, version: installedVersion(profileDir, name), spec: "", kind: "inbox" }));
  }
  for (const [name, spec] of Object.entries(deps)) {
    out.push(enrich({
      name,
      version: installedVersion(profileDir, name),
      spec: typeof spec === "string" ? spec : "",
      kind: bundleSet.has(name) ? "layer" : "plain",
    }));
  }
  out.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  return out;
}

// --- mcp tab ----------------------------------------------------------------------

export function mcpServersFromDump(ctx: PluginStoreContext, entries: ReturnType<typeof parseDumpConfig>["entries"]): McpServerView[] {
  return entries
    .filter((e) => e.name === MCP_CLIENT_PLUGIN)
    .map((e) => ({
      id: e.id,
      serverName: e.serverName ?? e.id,
      transport: e.transport ?? "stdio",
      command: e.command,
      url: e.url,
      argsCount: e.argsCount,
      disabled: e.disabled,
      ours: managedHasGroup(ctx, `mcp:${e.serverName ?? e.id}`),
    }))
    .sort((a, b) => a.serverName.localeCompare(b.serverName));
}

// --- skills tab -------------------------------------------------------------------

export interface SkillView {
  name: string;
  description: string;
  whenToUse?: string;
  modelInvocable: boolean;
}

/** skill.list needs a session; reuse the newest one, creating a blank if none. */
async function skillsFor(ctx: PluginStoreContext, port: number): Promise<SkillView[]> {
  const list = (await harnessRpc(port, "session.list", {})) as {
    items?: Array<{ sessionId?: unknown; parentSessionId?: unknown; origin?: unknown; updatedAt?: unknown }>;
  };
  const items = (list?.items ?? [])
    .filter((i) => typeof i.sessionId === "string" && i.parentSessionId === undefined && i.origin !== "subagent")
    .sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0));
  let sessionId = items[0]?.sessionId as string | undefined;
  if (!sessionId) {
    const created = (await harnessRpc(port, "session.create", {})) as { sessionId?: unknown };
    sessionId = typeof created?.sessionId === "string" ? created.sessionId : undefined;
  }
  if (!sessionId) return [];
  const value = (await harnessRpc(port, "skill.list", { sessionId })) as {
    skills?: Array<Record<string, unknown>>;
  };
  return (value?.skills ?? []).map((s) => ({
    name: typeof s.name === "string" ? s.name : "",
    description: typeof s.description === "string" ? s.description : "",
    whenToUse: typeof s.whenToUse === "string" ? s.whenToUse : undefined,
    modelInvocable: s.modelInvocable === true,
  })).filter((s) => s.name !== "");
}

// --- window + IPC ---------------------------------------------------------------

let managerWindow: BrowserWindow | null = null;

export function openPluginManagerWindow(preloadPath: string): void {
  if (managerWindow && !managerWindow.isDestroyed()) {
    managerWindow.focus();
    return;
  }
  managerWindow = new BrowserWindow({
    width: 820,
    height: 660,
    ...rememberedWindowBounds("pluginManager", { width: 640, height: 480 }),
    minWidth: 640,
    minHeight: 440,
    backgroundColor: themePayload().colors.bg,
    title: "Plugins",
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  trackWindowBounds("pluginManager", managerWindow);
  managerWindow.loadFile(join(__dirname, "../../resources/plugin-manager.html"), {
    query: { lang: localeForRenderer(), ...themeQuery() },
  });
  managerWindow.setMenu(null);
  managerWindow.on("closed", () => {
    managerWindow = null;
  });
}

function assertManagerSender(event: Electron.IpcMainInvokeEvent): void {
  if (!managerWindow || managerWindow.isDestroyed() || event.sender !== managerWindow.webContents) {
    throw new Error("unauthorized IPC sender");
  }
}

function sendProgress(line: string): void {
  if (managerWindow && !managerWindow.isDestroyed()) {
    managerWindow.webContents.send("plugin-manager:progress", line);
  }
}

/** One official verb (remove/update) against an installed dependency name. */
async function runVerb(
  ctx: PluginStoreContext,
  verb: "remove" | "update",
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!PKG_NAME_RE.test(name)) return { ok: false, error: "invalid package name" };
  const installed = listPlugins(ctx).find((p) => p.name === name && p.kind !== "inbox");
  if (!installed) return { ok: false, error: "not an installed plugin" };
  const registry = process.env.DSH_UPDATE_REGISTRY || "https://registry.npmmirror.com";
  const r = await runPnpmForward(ctx, [verb, name], registry, (m) => ctx.log(m), sendProgress);
  if (!r.ok) return { ok: false, error: r.output.slice(-500) };
  return { ok: true };
}

export function registerPluginManagerIpc(
  ctx: PluginStoreContext,
  getPort: () => number,
  onRestartHarness: () => Promise<void>,
): void {
  ipcMain.handle("plugin-manager:list", async (e) => {
    assertManagerSender(e);
    try {
      const d = await dump(ctx);
      const disabledIds = new Set(d.entries.filter((x) => x.disabled).map((x) => x.id));
      return { ok: true, items: listPlugins(ctx, d.bundleIds, disabledIds) };
    } catch (err) {
      // dump failed (e.g. profile mid-repair) — still show the basic list
      ctx.log(`dump-config failed: ${String(err)}`);
      return { ok: true, items: listPlugins(ctx), degraded: true };
    }
  });

  ipcMain.handle("plugin-manager:toggle", async (e, name: unknown, disable: unknown) => {
    assertManagerSender(e);
    if (typeof name !== "string" || !PKG_NAME_RE.test(name)) return { ok: false, error: "invalid package name" };
    const wantDisable = disable === true;
    try {
      const d = await dump(ctx);
      const ids = d.bundleIds.get(name) ?? [];
      if (ids.length === 0) return { ok: false, error: "no composed entries found for this plugin" };
      const yaml = ids.map((id) => `- id: ${id}\n  disabled: true`).join("\n");
      applyPatchGroup(ctx, `plugin:${name}`, wantDisable ? yaml : null);
      return { ok: true };
    } catch (err) {
      ctx.log(`plugin toggle failed: ${String(err)}`);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("plugin-manager:remove", async (e, name: unknown) => {
    assertManagerSender(e);
    try {
      return await runVerb(ctx, "remove", typeof name === "string" ? name : "");
    } catch (err) {
      ctx.log(`plugin remove failed: ${String(err)}`);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("plugin-manager:update", async (e, name: unknown) => {
    assertManagerSender(e);
    try {
      return await runVerb(ctx, "update", typeof name === "string" ? name : "");
    } catch (err) {
      ctx.log(`plugin update failed: ${String(err)}`);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // --- mcp ---
  ipcMain.handle("mcp:list", async (e) => {
    assertManagerSender(e);
    try {
      const d = await dump(ctx);
      return { ok: true, items: mcpServersFromDump(ctx, d.entries) };
    } catch (err) {
      ctx.log(`mcp list failed: ${String(err)}`);
      return { ok: false, items: [] as McpServerView[], error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("mcp:add", async (e, server: unknown) => {
    assertManagerSender(e);
    const s = (server ?? {}) as Record<string, unknown>;
    const input: McpServerInput = {
      serverName: typeof s.serverName === "string" ? s.serverName.trim() : "",
      transport: s.transport === "streamable-http" ? "streamable-http" : "stdio",
      command: typeof s.command === "string" ? s.command.trim() : "",
      args: Array.isArray(s.args) ? s.args.filter((a): a is string => typeof a === "string") : [],
      env: s.env && typeof s.env === "object" && !Array.isArray(s.env)
        ? Object.fromEntries(Object.entries(s.env).filter((e): e is [string, string] => typeof e[1] === "string"))
        : {},
      url: typeof s.url === "string" ? s.url.trim() : "",
      headers: s.headers && typeof s.headers === "object" && !Array.isArray(s.headers)
        ? Object.fromEntries(Object.entries(s.headers).filter((e): e is [string, string] => typeof e[1] === "string"))
        : {},
    };
    if (!SERVER_NAME_RE.test(input.serverName)) return { ok: false, error: "invalid server name (letters, digits, - _)" };
    if (input.transport === "stdio" && input.command === "") return { ok: false, error: "command is required" };
    if (input.transport === "streamable-http" && !/^https?:\/\//.test(input.url ?? "")) {
      return { ok: false, error: "a http(s) url is required" };
    }
    try {
      const d = await dump(ctx);
      const clash = mcpServersFromDump(ctx, d.entries).find((m) => m.serverName === input.serverName);
      if (clash) return { ok: false, error: `server name "${input.serverName}" already exists` };
      applyPatchGroup(ctx, `mcp:${input.serverName}`, renderMcpInsert(input));
      return { ok: true };
    } catch (err) {
      ctx.log(`mcp add failed: ${String(err)}`);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("mcp:toggle", async (e, id: unknown, serverName: unknown, disable: unknown) => {
    assertManagerSender(e);
    if (typeof id !== "string" || id === "") return { ok: false, error: "invalid id" };
    const wantDisable = disable === true;
    try {
      applyPatchGroup(ctx, `mcpoff:${id}`, wantDisable ? `- id: ${id}\n  disabled: true` : null);
      return { ok: true };
    } catch (err) {
      ctx.log(`mcp toggle failed: ${String(err)}`);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("mcp:remove", async (e, serverName: unknown) => {
    assertManagerSender(e);
    if (typeof serverName !== "string" || !SERVER_NAME_RE.test(serverName)) {
      return { ok: false, error: "invalid server name" };
    }
    try {
      if (!managedHasGroup(ctx, `mcp:${serverName}`)) {
        return { ok: false, pluginProvided: true, error: "this server is provided by a plugin — disable it instead" };
      }
      applyPatchGroup(ctx, `mcp:${serverName}`, null);
      return { ok: true };
    } catch (err) {
      ctx.log(`mcp remove failed: ${String(err)}`);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("mcp:openConfig", (e) => {
    assertManagerSender(e);
    const path = patchFilePath(ctx);
    if (!existsSync(path)) writePatchFile(path, "[]\n");
    return shell.openPath(path);
  });

  // --- skills ---
  ipcMain.handle("skills:list", async (e) => {
    assertManagerSender(e);
    try {
      return { ok: true, items: await skillsFor(ctx, getPort()) };
    } catch (err) {
      ctx.log(`skill.list failed: ${String(err)}`);
      return { ok: false, items: [] as SkillView[], error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("skills:openDir", (e) => {
    assertManagerSender(e);
    const dir = join(ctx.dshHome, "skills");
    mkdirSync(dir, { recursive: true });
    return shell.openPath(dir);
  });

  ipcMain.handle("plugin-manager:restart", async (e) => {
    assertManagerSender(e);
    try {
      await onRestartHarness();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("plugin-manager:locale", (e) => {
    assertManagerSender(e);
    return localeForRenderer();
  });
}
