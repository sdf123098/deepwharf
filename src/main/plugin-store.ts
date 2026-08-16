import { ipcMain, BrowserWindow, shell } from "electron";
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { localeForRenderer } from "./i18n";
import { rememberedWindowBounds, trackWindowBounds } from "./window";
import { themePayload, themeQuery } from "./theme";

export interface PluginInfo {
  name: string;
  version: string;
  description: string;
  author: string;
  date: string;
  repository: string;
  score: number;
  /** True only when the published manifest declares dsh.bundle.patch. */
  dshBundle: boolean;
  /** False only for sources we cannot hand to `dsh plugin add` at all. */
  installable: boolean;
  /** Category tag for curated sources (e.g. awesome-dsh-plugin). */
  category: string;
  /** The exact spec passed to `dsh plugin add` (npm name or github:owner/repo). */
  installSpec: string;
}

export interface PluginSource {
  id: string;
  kind: "npm" | "github" | "curated";
  registry?: string;
}

/**
 * Switchable plugin sources. The first npm source is the default; a custom
 * registry (DSH_PLUGIN_SEARCH_URL) is prepended when set.
 */
export const PLUGIN_SOURCES: PluginSource[] = (() => {
  const list: PluginSource[] = [
    { id: "npmmirror", kind: "npm", registry: "https://registry.npmmirror.com" },
    { id: "npmjs", kind: "npm", registry: "https://registry.npmjs.org" },
    { id: "awesome", kind: "curated" },
    { id: "github", kind: "github" },
  ];
  if (process.env.DSH_PLUGIN_SEARCH_URL) {
    list.unshift({ id: "custom", kind: "npm", registry: process.env.DSH_PLUGIN_SEARCH_URL });
  }
  return list;
})();

export interface PluginStoreContext {
  nodeExecutable: string;
  harnessEntry: string;
  dshHome: string;
  log: (msg: string) => void;
}

/** npm package name: optional @scope/, then a valid name segment. */
const PACKAGE_NAME_RE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
/** A bare or prefixed GitHub repo shorthand (owner/repo or github:owner/repo). */
const GITHUB_SPEC_RE = /^github:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$|^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/;

/**
 * Anything handed to `dsh plugin add` (a thin pnpm forwarder): never empty,
 * never control characters, never a leading "-" (flag injection into pnpm).
 */
function isSafeSpec(s: string): boolean {
  return s.length > 0 && s.length <= 500 && !/[\r\n\t\0]/.test(s) && !s.startsWith("-");
}

const MAX_INSTALL_OUTPUT = 64 * 1024;

export function resolveSource(id: string | undefined): PluginSource {
  return PLUGIN_SOURCES.find((s) => s.id === id) ?? PLUGIN_SOURCES[0];
}

function isKnownRegistry(registry: string): boolean {
  return PLUGIN_SOURCES.some((s) => s.kind === "npm" && s.registry === registry);
}

/** Fetch a package manifest and check whether it is a real Harness bundle. */
async function fetchPluginManifest(pkg: string, registry: string): Promise<{ dshBundle: boolean }> {
  try {
    const res = await fetch(`${registry}/${encodeURIComponent(pkg)}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { dshBundle: false };
    const manifest = (await res.json()) as {
      "dist-tags"?: { latest?: string };
      versions?: Record<string, { dsh?: { bundle?: { patch?: unknown } } }>;
    };
    // The `dsh` field is published per-version; it lives under versions[latest],
    // not on the registry root manifest.
    const latest = manifest?.["dist-tags"]?.latest;
    const versionManifest =
      latest && manifest.versions?.[latest]
        ? manifest.versions[latest]
        : undefined;
    return { dshBundle: Boolean(versionManifest?.dsh?.bundle?.patch) };
  } catch {
    return { dshBundle: false };
  }
}

async function searchNpmPlugins(
  query: string,
  from: number,
  registry: string,
): Promise<PluginInfo[]> {
  const url = `${registry}/-/v1/search?text=${encodeURIComponent(query)}&from=${from}&size=20`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`search failed: ${res.status}`);
  const data = (await res.json()) as {
    objects: Array<{
      package: {
        name: string;
        version: string;
        description?: string;
        author?: { name?: string };
        publisher?: { username?: string };
        date?: string;
        links?: { repository?: string; homepage?: string };
      };
      score?: { final?: number };
    }>;
  };
  const items: PluginInfo[] = (data.objects ?? []).map((o) => ({
    name: o.package.name,
    version: o.package.version,
    description: o.package.description ?? "",
    author: o.package.publisher?.username ?? o.package.author?.name ?? "",
    date: o.package.date ?? "",
    repository: o.package.links?.repository ?? o.package.links?.homepage ?? "",
    score: o.score?.final ?? 0,
    dshBundle: false,
    installable: true,
    category: "",
    installSpec: o.package.name,
  }));
  // Verify each candidate against its published manifest so only real Harness
  // bundles are presented as plugins.
  return Promise.all(
    items.map(async (p) => ({ ...p, dshBundle: (await fetchPluginManifest(p.name, registry)).dshBundle })),
  );
}

/** Community source: repositories tagged `dsh-plugin` on GitHub. */
async function searchGithubPlugins(query: string): Promise<PluginInfo[]> {
  const q = query ? `topic:dsh-plugin ${query}` : "topic:dsh-plugin";
  const res = await fetch(
    `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&per_page=20`,
    {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "DeepWharf" },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!res.ok) throw new Error(`github search failed: ${res.status}`);
  const data = (await res.json()) as {
    items?: Array<{
      full_name: string;
      description?: string;
      html_url: string;
      stargazers_count?: number;
      owner?: { login?: string };
    }>;
  };
  return (data.items ?? []).map((r) => ({
    name: r.full_name,
    version: "",
    description: r.description ?? "",
    author: r.owner?.login ?? "",
    date: "",
    repository: r.html_url,
    score: r.stargazers_count ?? 0,
    dshBundle: false,
    // GitHub shorthand installs through the same official `dsh plugin add`
    // (a thin pnpm forwarder) — the tarball comes from codeload.github.com.
    installable: true,
    category: "",
    installSpec: `github:${r.full_name}`,
  }));
}

// --- curated community list: awesome-dsh-plugin (machine-readable data) ------

const AWESOME_DATA_URL =
  "https://raw.githubusercontent.com/bruc3van/awesome-dsh-plugin/main/data/repositories.json";
const AWESOME_CACHE_MS = 30 * 60 * 1000;
// The harness itself carries the topic tag but is not a plugin.
const AWESOME_EXCLUDED = new Set(["deepseek-ai/deepseek-harness"]);

interface AwesomeRepo {
  full_name: string;
  html_url: string;
  description?: string;
  category_en?: string;
  stargazers_count?: number;
  archived?: boolean;
  disabled?: boolean;
  topics?: string[];
}

let awesomeCache: { fetchedAt: number; repos: AwesomeRepo[] } | null = null;

async function getAwesomeRepos(): Promise<AwesomeRepo[]> {
  if (awesomeCache && Date.now() - awesomeCache.fetchedAt < AWESOME_CACHE_MS) {
    return awesomeCache.repos;
  }
  const res = await fetch(AWESOME_DATA_URL, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`awesome list responded ${res.status}`);
  const data = (await res.json()) as { repositories?: AwesomeRepo[] };
  awesomeCache = { fetchedAt: Date.now(), repos: data.repositories ?? [] };
  return awesomeCache.repos;
}

async function searchAwesomePlugins(query: string): Promise<PluginInfo[]> {
  const q = query.trim().toLowerCase();
  const repos = (await getAwesomeRepos()).filter(
    (r) => !AWESOME_EXCLUDED.has(r.full_name) && !r.archived && !r.disabled,
  );
  const hits = q
    ? repos.filter((r) =>
        [r.full_name, r.description, r.category_en, (r.topics ?? []).join(" ")]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
    : repos;
  hits.sort((a, b) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0));
  return hits.slice(0, 30).map((r) => ({
    name: r.full_name,
    version: "",
    description: r.description ?? "",
    author: r.full_name.split("/")[0] ?? "",
    date: "",
    repository: r.html_url,
    score: r.stargazers_count ?? 0,
    dshBundle: false,
    installable: true,
    category: r.category_en ?? "",
    installSpec: `github:${r.full_name}`,
  }));
}

export async function searchPlugins(
  query: string,
  from = 0,
  source: PluginSource,
): Promise<PluginInfo[]> {
  if (source.kind === "github") return searchGithubPlugins(query);
  if (source.kind === "curated") return searchAwesomePlugins(query);
  return searchNpmPlugins(query, from, source.registry ?? "https://registry.npmmirror.com");
}

// --- install via the harness's own `dsh plugin` command + bundled pnpm --------

export async function installPlugin(
  ctx: PluginStoreContext,
  pkg: string,
  registry: string,
  onProgress?: (line: string) => void,
): Promise<{ ok: boolean; output: string }> {
  return runPnpmForward(ctx, ["add", pkg], registry, (m) => ctx.log(m), onProgress);
}

/**
 * Run one `dsh plugin --profile web <args…>` invocation (add / remove /
 * update — the CLI forwards everything to pnpm verbatim) and stream its
 * output to the caller.
 */
export async function runPnpmForward(
  ctx: PluginStoreContext,
  verbArgs: string[],
  registry: string,
  logLine: (m: string) => void,
  onProgress?: (line: string) => void,
): Promise<{ ok: boolean; output: string }> {
  const pnpmDir = join(dirname(ctx.nodeExecutable), "pnpm"); // resources/runtime/pnpm
  const env = {
    ...process.env,
    DSH_HOME: ctx.dshHome,
    npm_config_registry: registry,
    PATH: `${pnpmDir}${require("node:path").delimiter}${process.env.PATH ?? ""}`,
  };
  logLine(`dsh plugin ${verbArgs.join(" ")}`);
  const child = spawn(
    ctx.nodeExecutable,
    [ctx.harnessEntry, "plugin", "--profile", "web", ...verbArgs],
    { env, windowsHide: true },
  );
  // Bounded output buffer; each chunk is also forwarded so the user sees
  // live install/download progress.
  let output = "";
  const appendOutput = (c: Buffer) => {
    const text = c.toString();
    if (onProgress) onProgress(text.trim());
    output += text;
    if (output.length > MAX_INSTALL_OUTPUT) {
      output = output.slice(-MAX_INSTALL_OUTPUT);
    }
  };
  child.stdout.on("data", appendOutput);
  child.stderr.on("data", appendOutput);
  const code: number = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (c) => resolve(c ?? -1));
  });
  logLine(`dsh plugin ${verbArgs.join(" ")} -> exit ${code}`);
  return { ok: code === 0, output };
}

export function listInstalled(ctx: PluginStoreContext): string[] {
  try {
    const pkgJson = join(ctx.dshHome, "profiles", "web", "package.json");
    if (!existsSync(pkgJson)) return [];
    const manifest = JSON.parse(readFileSync(pkgJson, "utf8"));
    // A plugin can be active two ways: listed in dsh.profile.bundles (the
    // real plugin set) or sitting in dependencies — GitHub installs without
    // a dsh.bundle land there until an upstream update promotes them. The
    // union covers both so the store reflects what `dsh plugin` installed.
    const bundles = Array.isArray(manifest?.dsh?.profile?.bundles)
      ? manifest.dsh.profile.bundles.filter((b: unknown) => typeof b === "string")
      : [];
    const deps = Object.keys(manifest?.dependencies ?? {});
    return [...new Set([...bundles, ...deps])];
  } catch {
    return [];
  }
}

// --- IPC + store window ------------------------------------------------------

let storeWindow: BrowserWindow | null = null;

export function openPluginStore(preloadPath: string, locale: string): void {
  if (storeWindow && !storeWindow.isDestroyed()) {
    storeWindow.focus();
    return;
  }
  storeWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    ...rememberedWindowBounds("store", { width: 700, height: 480 }),
    minWidth: 700,
    minHeight: 480,
    backgroundColor: themePayload().colors.bg,
    title: "Plugin Store",
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  trackWindowBounds("store", storeWindow);
  // Registry metadata (repository/homepage) is not a trusted navigation target:
  // deny everything and only open https: links in the system browser.
  storeWindow.webContents.setWindowOpenHandler(({ url }) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { action: "deny" };
    }
    if (parsed.protocol === "https:") void shell.openExternal(url);
    return { action: "deny" };
  });
  storeWindow.loadFile(join(__dirname, "../../resources/plugin-store.html"), {
    query: { lang: locale, ...themeQuery() },
  });
  storeWindow.setMenu(null); // no redundant menu bar
  storeWindow.on("closed", () => {
    storeWindow = null;
  });
}

function assertStoreSender(event: Electron.IpcMainInvokeEvent): void {
  if (!storeWindow || storeWindow.isDestroyed() || event.sender !== storeWindow.webContents) {
    throw new Error("unauthorized IPC sender");
  }
}

export function registerPluginStoreIpc(
  ctx: PluginStoreContext,
  onRestartHarness: () => Promise<void>,
): void {
  ipcMain.handle("plugin-store:sources", (e) => {
    assertStoreSender(e);
    return PLUGIN_SOURCES;
  });
  ipcMain.handle("plugin-store:search", async (e, query: unknown, from?: unknown, sourceId?: unknown) => {
    assertStoreSender(e);
    if (typeof query !== "string") throw new Error("invalid query");
    const fromN = typeof from === "number" && Number.isFinite(from) ? Math.max(0, Math.floor(from)) : 0;
    const source = resolveSource(typeof sourceId === "string" ? sourceId : undefined);
    return searchPlugins(query, fromN, source);
  });
  ipcMain.handle("plugin-store:installed", (e) => {
    assertStoreSender(e);
    return listInstalled(ctx);
  });
  ipcMain.handle("plugin-store:install", async (e, spec: unknown, registry: unknown, opts: unknown) => {
    assertStoreSender(e);
    if (typeof spec !== "string" || !isSafeSpec(spec)) {
      throw new Error("invalid install spec");
    }
    const manual =
      !!opts && typeof opts === "object" && (opts as Record<string, unknown>).manual === true;
    const reg =
      typeof registry === "string" && isKnownRegistry(registry) && registry !== ""
        ? registry
        : PLUGIN_SOURCES[0].registry ?? "https://registry.npmmirror.com";

    // GitHub shorthand (owner/repo or github:owner/repo) goes straight to the
    // official forwarder; dsh itself warns when the repo declares no dsh.bundle.
    const gh = GITHUB_SPEC_RE.exec(spec);
    const isGithub = spec.startsWith("github:") || gh !== null;
    const finalSpec = gh && !spec.startsWith("github:") ? `github:${spec}` : spec;

    // npm search-result rows keep the verified-bundle guarantee; manual input
    // is deliberately free-form (any pnpm spec the official CLI accepts).
    if (!isGithub && !manual) {
      if (!PACKAGE_NAME_RE.test(spec)) throw new Error("invalid package name");
      const { dshBundle } = await fetchPluginManifest(spec, reg);
      if (!dshBundle) {
        throw new Error(`"${spec}" does not declare dsh.bundle — not a Harness plugin`);
      }
    }
    const r = await installPlugin(ctx, finalSpec, reg, (line) => {
      if (storeWindow && !storeWindow.isDestroyed()) {
        storeWindow.webContents.send("plugin-store:progress", line);
      }
    });
    if (!r.ok) throw new Error(r.output.slice(-500));
    return { ok: true, spec: finalSpec };
  });
  ipcMain.handle("plugin-store:restart", (e) => {
    assertStoreSender(e);
    return onRestartHarness();
  });
  ipcMain.handle("plugin-store:locale", (e) => {
    assertStoreSender(e);
    return localeForRenderer();
  });
  ipcMain.handle("plugin-store:openExternal", async (e, url: unknown) => {
    assertStoreSender(e);
    let parsed: URL;
    try {
      parsed = new URL(String(url));
    } catch {
      return { ok: false };
    }
    if (parsed.protocol !== "https:") return { ok: false };
    await shell.openExternal(parsed.toString());
    return { ok: true };
  });
}
