import { ipcMain, BrowserWindow, nativeTheme, shell } from "electron";
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { UPDATE_REGISTRY } from "./harness-update";
import { localeForRenderer } from "./i18n";

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
}

export interface PluginStoreContext {
  nodeExecutable: string;
  harnessEntry: string;
  dshHome: string;
  log: (msg: string) => void;
}

const SEARCH_BASE = process.env.DSH_PLUGIN_SEARCH_URL || "https://registry.npmmirror.com";

/** npm package name: optional @scope/, then a valid name segment. */
const PACKAGE_NAME_RE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

const MAX_INSTALL_OUTPUT = 64 * 1024;

// --- data source: npm registry search (the live index of installable plugins) --

function registryManifestUrl(pkg: string): string {
  return `${SEARCH_BASE}/${encodeURIComponent(pkg)}`;
}

/** Fetch a package manifest and check whether it is a real Harness bundle. */
async function fetchPluginManifest(pkg: string): Promise<{ dshBundle: boolean }> {
  try {
    const res = await fetch(registryManifestUrl(pkg), { signal: AbortSignal.timeout(10000) });
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

export async function searchPlugins(query: string, from = 0): Promise<PluginInfo[]> {
  const url = `${SEARCH_BASE}/-/v1/search?text=${encodeURIComponent(query)}&from=${from}&size=20`;
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
  }));
  // Verify each candidate against its published manifest so only real Harness
  // bundles are presented as plugins.
  return Promise.all(
    items.map(async (p) => ({ ...p, dshBundle: (await fetchPluginManifest(p.name)).dshBundle })),
  );
}

// --- install via the harness's own `dsh plugin` command + bundled pnpm --------

export async function installPlugin(
  ctx: PluginStoreContext,
  pkg: string,
): Promise<{ ok: boolean; output: string }> {
  const pnpmDir = join(dirname(ctx.nodeExecutable), "pnpm"); // resources/runtime/pnpm
  const env = {
    ...process.env,
    DSH_HOME: ctx.dshHome,
    npm_config_registry: UPDATE_REGISTRY,
    PATH: `${pnpmDir}${require("node:path").delimiter}${process.env.PATH ?? ""}`,
  };
  ctx.log(`dsh plugin add ${pkg}`);
  const child = spawn(
    ctx.nodeExecutable,
    [ctx.harnessEntry, "plugin", "--profile", "web", "add", pkg],
    { env, windowsHide: true },
  );
  // Bounded output buffer: install logs are only used for the last-500 error
  // tail, so keeping everything can let a noisy package balloon memory.
  let output = "";
  const appendOutput = (c: Buffer) => {
    output += c.toString();
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
    const deps = JSON.parse(readFileSync(pkgJson, "utf8")).dependencies ?? {};
    return Object.keys(deps).filter((d) => d.startsWith("dsh-") || d.includes("dsh"));
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
    width: 920,
    height: 680,
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
  ipcMain.handle("plugin-store:search", async (e, query: unknown, from?: unknown) => {
    assertStoreSender(e);
    if (typeof query !== "string") throw new Error("invalid query");
    const fromN = typeof from === "number" && Number.isFinite(from) ? Math.max(0, Math.floor(from)) : 0;
    return searchPlugins(query, fromN);
  });
  ipcMain.handle("plugin-store:installed", (e) => {
    assertStoreSender(e);
    return listInstalled(ctx);
  });
  ipcMain.handle("plugin-store:install", async (e, pkg: unknown) => {
    assertStoreSender(e);
    if (typeof pkg !== "string" || !PACKAGE_NAME_RE.test(pkg)) {
      throw new Error("invalid package name");
    }
    const { dshBundle } = await fetchPluginManifest(pkg);
    if (!dshBundle) {
      throw new Error(`"${pkg}" does not declare dsh.bundle — not a Harness plugin`);
    }
    const r = await installPlugin(ctx, pkg);
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
