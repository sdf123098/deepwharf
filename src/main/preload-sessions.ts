import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("sessionsApi", {
  locale: () => ipcRenderer.invoke("sessions:locale"),
  list: () => ipcRenderer.invoke("sessions:list"),
  search: (query: string) => ipcRenderer.invoke("sessions:search", query),
  export: (sessionId: string) => ipcRenderer.invoke("sessions:export", sessionId),
  onTheme: (cb: (payload: unknown) => void) =>
    ipcRenderer.on("theme:changed", (_e, payload) => cb(payload)),
});
