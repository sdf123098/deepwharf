import { ipcMain, BrowserWindow, nativeTheme } from "electron";
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
}

export interface PluginStoreContext {
  nodeExecutable: string;
  harnessEntry: string;
  dshHome: string;
  log: (msg: string) => void;
}

const SEARCH_BASE = process.env.DSH_PLUGIN_SEARCH_URL || "https://registry.npmmirror.com";

// --- data source: npm registry search (the live index of installable plugins) --

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
  return (data.objects ?? []).map((o) => ({
    name: o.package.name,
    version: o.package.version,
    description: o.package.description ?? "",
    author: o.package.publisher?.username ?? o.package.author?.name ?? "",
    date: o.package.date ?? "",
    repository: o.package.links?.repository ?? o.package.links?.homepage ?? "",
    score: o.score?.final ?? 0,
  }));
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
  let output = "";
  child.stdout.on("data", (c) => (output += c));
  child.stderr.on("data", (c) => (output += c));
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
  storeWindow.loadFile(join(__dirname, "../../resources/plugin-store.html"), {
    query: { lang: locale },
  });
  storeWindow.setMenu(null); // no redundant menu bar
  storeWindow.on("closed", () => {
    storeWindow = null;
  });
}

export function registerPluginStoreIpc(
  ctx: PluginStoreContext,
  onRestartHarness: () => Promise<void>,
): void {
  ipcMain.handle("plugin-store:search", (_e, query: string, from?: number) =>
    searchPlugins(query, from ?? 0),
  );
  ipcMain.handle("plugin-store:installed", () => listInstalled(ctx));
  ipcMain.handle("plugin-store:install", async (_e, pkg: string) => {
    const r = await installPlugin(ctx, pkg);
    if (!r.ok) throw new Error(r.output.slice(-500));
    return { ok: true };
  });
  ipcMain.handle("plugin-store:restart", () => onRestartHarness());
  ipcMain.handle("plugin-store:locale", () => localeForRenderer());
}
