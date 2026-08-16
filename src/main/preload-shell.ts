import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("shellApi", {
  locale: () => ipcRenderer.invoke("shell:locale"),
  openStore: () => ipcRenderer.invoke("shell:openStore"),
  openSettings: () => ipcRenderer.invoke("shell:openSettings"),
  openSessions: () => ipcRenderer.invoke("shell:openSessions"),
  openUsage: () => ipcRenderer.invoke("shell:openUsage"),
  openPluginManager: () => ipcRenderer.invoke("shell:openPluginManager"),
  openHarnessSettings: () => ipcRenderer.invoke("shell:openHarnessSettings"),
  checkHarness: () => ipcRenderer.invoke("shell:checkHarness"),
  checkShell: () => ipcRenderer.invoke("shell:checkShell"),
  versions: () => ipcRenderer.invoke("shell:versions"),
  // Harness restarts on a fresh port; the shell page itself must stay alive.
  onHarnessPort: (cb: (port: number) => void) => {
    ipcRenderer.on("shell:harness-port", (_e, port: number) => cb(port));
  },
  onTheme: (cb: (payload: unknown) => void) =>
    ipcRenderer.on("theme:changed", (_e, payload) => cb(payload)),
});
