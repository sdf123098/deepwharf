import { contextBridge, ipcRenderer } from "electron";

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
