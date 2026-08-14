import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("shellApi", {
  locale: () => ipcRenderer.invoke("shell:locale"),
  openStore: () => ipcRenderer.invoke("shell:openStore"),
  openSettings: () => ipcRenderer.invoke("shell:openSettings"),
  checkHarness: () => ipcRenderer.invoke("shell:checkHarness"),
  checkShell: () => ipcRenderer.invoke("shell:checkShell"),
  versions: () => ipcRenderer.invoke("shell:versions"),
});
