import { ipcMain, BrowserWindow, shell } from "electron";
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { localeForRenderer } from "./i18n";
import { rememberedWindowBounds, trackWindowBounds } from "./window";

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
  /** False for non-npm sources (e.g. GitHub topic) — no install button. */
  installable: boolean;
  /** Category tag for curated sources (e.g. awesome-dsh-plugin). */
  category: string;
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
    installable: false,
    category: "",
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
    installable: false,
    category: r.category_en ?? "",
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
  const pnpmDir = join(dirname(ctx.nodeExecutable), "pnpm"); // resources/runtime/pnpm
  const env = {
    ...process.env,
    DSH_HOME: ctx.dshHome,
    npm_config_registry: registry,
    PATH: `${pnpmDir}${require("node:path").delimiter}${process.env.PATH ?? ""}`,
  };
  ctx.log(`dsh plugin add ${pkg}`);
  const child = spawn(
    ctx.nodeExecutable,
    [ctx.harnessEntry, "plugin", "--profile", "web", "add", pkg],
    { env, windowsHide: true },
  );
  // Bounded output buffer; each chunk is also forwarded to the store window so
  // the user sees live install/download progress.
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
  ctx.log(`dsh plugin add ${pkg} -> exit ${code}`);
  return { ok: code === 0, output };
}

export function listInstalled(ctx: PluginStoreContext): string[] {
  try {
    const pkgJson = join(ctx.dshHome, "profiles", "web", "package.json");
    if (!existsSync(pkgJson)) return [];
    const manifest = JSON.parse(readFileSync(pkgJson, "utf8"));
    // The profile's active bundles are the real plugin set — the old name
    // heuristic missed bundles whose names don't contain "dsh".
    const bundles = manifest?.dsh?.profile?.bundles;
    if (Array.isArray(bundles)) return bundles.filter((b) => typeof b === "string");
    // Degraded fallback for profiles without a bundles list.
    const deps = manifest?.dependencies ?? {};
    return Object.keys(deps);
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
    backgroundColor: "#0d1117",
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
    query: { lang: locale },
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
  ipcMain.handle("plugin-store:install", async (e, pkg: unknown, registry: unknown) => {
    assertStoreSender(e);
    if (typeof pkg !== "string" || !PACKAGE_NAME_RE.test(pkg)) {
      throw new Error("invalid package name");
    }
    if (typeof registry !== "string" || !isKnownRegistry(registry)) {
      throw new Error("invalid registry source");
    }
    const { dshBundle } = await fetchPluginManifest(pkg, registry);
    if (!dshBundle) {
      throw new Error(`"${pkg}" does not declare dsh.bundle — not a Harness plugin`);
    }
    const r = await installPlugin(ctx, pkg, registry, (line) => {
      if (storeWindow && !storeWindow.isDestroyed()) {
        storeWindow.webContents.send("plugin-store:progress", line);
      }
    });
    if (!r.ok) throw new Error(r.output.slice(-500));
    return { ok: true };
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
