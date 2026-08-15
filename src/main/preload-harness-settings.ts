import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("harnessSettingsApi", {
  get: () => ipcRenderer.invoke("harness-settings:get"),
  apply: (input: unknown) => ipcRenderer.invoke("harness-settings:apply", input),
  restart: () => ipcRenderer.invoke("harness-settings:restart"),
  locale: () => ipcRenderer.invoke("harness-settings:locale"),
});
