import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("onboardingApi", {
  locale: () => ipcRenderer.invoke("onboarding:locale"),
  status: () => ipcRenderer.invoke("onboarding:status"),
  save: (values: Record<string, string>) => ipcRenderer.invoke("onboarding:save", values),
  skip: () => ipcRenderer.invoke("onboarding:skip"),
  onTheme: (cb: (payload: unknown) => void) =>
    ipcRenderer.on("theme:changed", (_e, payload) => cb(payload)),
});
