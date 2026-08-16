import { contextBridge, ipcRenderer } from "electron";

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
