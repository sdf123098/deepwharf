import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("pluginApi", {
  search: (query: string, from?: number) =>
    ipcRenderer.invoke("plugin-store:search", query, from ?? 0),
  installed: () => ipcRenderer.invoke("plugin-store:installed"),
  install: (pkg: string) => ipcRenderer.invoke("plugin-store:install", pkg),
  restart: () => ipcRenderer.invoke("plugin-store:restart"),
  locale: () => ipcRenderer.invoke("plugin-store:locale"),
  onLocale: (cb: (l: string) => void) =>
    ipcRenderer.on("plugin-store:locale", (_e, l: string) => cb(l)),
});
