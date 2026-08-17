import { contextBridge, ipcRenderer } from "electron";
// Sandboxed preloads cannot require() relative modules, so every preload
// inlines this window-chrome exposure (frameless windows drive their own UI).
contextBridge.exposeInMainWorld("chromeApi", {
  close: () => ipcRenderer.send("window:close"),
  minimize: () => ipcRenderer.send("window:minimize"),
});

contextBridge.exposeInMainWorld("pluginApi", {
  sources: () => ipcRenderer.invoke("plugin-store:sources"),
  search: (query: string, from?: number, sourceId?: string) =>
    ipcRenderer.invoke("plugin-store:search", query, from ?? 0, sourceId),
  installed: () => ipcRenderer.invoke("plugin-store:installed"),
  install: (spec: string, registry: string, opts?: { manual?: boolean }) =>
    ipcRenderer.invoke("plugin-store:install", spec, registry, opts ?? {}),
  restart: () => ipcRenderer.invoke("plugin-store:restart"),
  locale: () => ipcRenderer.invoke("plugin-store:locale"),
  onLocale: (cb: (l: string) => void) =>
    ipcRenderer.on("plugin-store:locale", (_e, l: string) => cb(l)),
  // Live install/download progress lines from the main process.
  onProgress: (cb: (line: string) => void) =>
    ipcRenderer.on("plugin-store:progress", (_e, line: string) => cb(line)),
  // Registry-supplied repository links are validated (https only) by Main.
  openExternal: (url: string) => ipcRenderer.invoke("plugin-store:openExternal"),
  onTheme: (cb: (payload: unknown) => void) =>
    ipcRenderer.on("theme:changed", (_e, payload) => cb(payload)),
});
