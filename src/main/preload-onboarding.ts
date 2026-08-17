import { contextBridge, ipcRenderer } from "electron";
// Sandboxed preloads cannot require() relative modules, so every preload
// inlines this window-chrome exposure (frameless windows drive their own UI).
contextBridge.exposeInMainWorld("chromeApi", {
  close: () => ipcRenderer.send("window:close"),
  minimize: () => ipcRenderer.send("window:minimize"),
});

contextBridge.exposeInMainWorld("onboardingApi", {
  locale: () => ipcRenderer.invoke("onboarding:locale"),
  status: () => ipcRenderer.invoke("onboarding:status"),
  save: (values: Record<string, string>) => ipcRenderer.invoke("onboarding:save", values),
  skip: () => ipcRenderer.invoke("onboarding:skip"),
  onTheme: (cb: (payload: unknown) => void) =>
    ipcRenderer.on("theme:changed", (_e, payload) => cb(payload)),
});
