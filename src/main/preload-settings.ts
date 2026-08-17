import { contextBridge, ipcRenderer } from "electron";

// Merged settings page: shell settings + Harness settings + plugin manager +
// usage all live in one window. Every feature keeps its original API surface
// so the merged renderer reuses the existing logic unchanged.

contextBridge.exposeInMainWorld("settingsApi", {
  locale: () => ipcRenderer.invoke("settings:locale"),
  get: () => ipcRenderer.invoke("settings:get"),
  set: (patch: Record<string, unknown>) => ipcRenderer.invoke("settings:set", patch),
  openLogs: () => ipcRenderer.invoke("settings:openLogs"),
  openLogViewer: () => ipcRenderer.invoke("settings:openLogViewer"),
  clearLogs: () => ipcRenderer.invoke("settings:clearLogs"),
  checkHarness: () => ipcRenderer.invoke("settings:checkHarness"),
  checkShell: () => ipcRenderer.invoke("settings:checkShell"),
  versions: () => ipcRenderer.invoke("settings:versions"),
  onTheme: (cb: (payload: unknown) => void) =>
    ipcRenderer.on("theme:changed", (_e, payload) => cb(payload)),
});

contextBridge.exposeInMainWorld("harnessSettingsApi", {
  get: () => ipcRenderer.invoke("harness-settings:get"),
  apply: (input: unknown) => ipcRenderer.invoke("harness-settings:apply", input),
  restart: () => ipcRenderer.invoke("harness-settings:restart"),
  locale: () => ipcRenderer.invoke("harness-settings:locale"),
});

contextBridge.exposeInMainWorld("managerApi", {
  locale: () => ipcRenderer.invoke("plugin-manager:locale"),
  list: () => ipcRenderer.invoke("plugin-manager:list"),
  toggle: (name: string, disable: boolean) => ipcRenderer.invoke("plugin-manager:toggle", name, disable),
  remove: (name: string) => ipcRenderer.invoke("plugin-manager:remove", name),
  update: (name: string) => ipcRenderer.invoke("plugin-manager:update", name),
  restart: () => ipcRenderer.invoke("plugin-manager:restart"),
  mcpList: () => ipcRenderer.invoke("mcp:list"),
  mcpAdd: (server: Record<string, unknown>) => ipcRenderer.invoke("mcp:add", server),
  mcpToggle: (id: string, serverName: string, disable: boolean) =>
    ipcRenderer.invoke("mcp:toggle", id, serverName, disable),
  mcpRemove: (serverName: string) => ipcRenderer.invoke("mcp:remove", serverName),
  mcpOpenConfig: () => ipcRenderer.invoke("mcp:openConfig"),
  skillsList: () => ipcRenderer.invoke("skills:list"),
  skillsOpenDir: () => ipcRenderer.invoke("skills:openDir"),
  onProgress: (cb: (line: string) => void) => {
    ipcRenderer.on("plugin-manager:progress", (_e, line: string) => cb(line));
  },
  onTheme: (cb: (payload: unknown) => void) =>
    ipcRenderer.on("theme:changed", (_e, payload) => cb(payload)),
});

contextBridge.exposeInMainWorld("usageApi", {
  locale: () => ipcRenderer.invoke("usage:locale"),
  snapshot: () => ipcRenderer.invoke("usage:snapshot"),
  watch: (sessionId: string | null) => ipcRenderer.invoke("usage:watch", sessionId),
  onUpdate: (cb: (update: { sessionId: string; key: string; value: unknown }) => void) => {
    ipcRenderer.on("usage:update", (_e, u) => cb(u));
  },
  onTheme: (cb: (payload: unknown) => void) =>
    ipcRenderer.on("theme:changed", (_e, payload) => cb(payload)),
});

contextBridge.exposeInMainWorld("sessionsApi", {
  locale: () => ipcRenderer.invoke("sessions:locale"),
  list: () => ipcRenderer.invoke("sessions:list"),
  search: (query: string) => ipcRenderer.invoke("sessions:search", query),
  export: (sessionId: string) => ipcRenderer.invoke("sessions:export", sessionId),
});

contextBridge.exposeInMainWorld("remoteApi", {
  info: () => ipcRenderer.invoke("settings:remote-info"),
  newToken: () => ipcRenderer.invoke("settings:remote-token"),
});
