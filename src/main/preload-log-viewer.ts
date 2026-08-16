import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("logApi", {
  locale: () => ipcRenderer.invoke("log-viewer:locale"),
  openLogs: () => ipcRenderer.invoke("log-viewer:openLogs"),
  onChunk: (cb: (chunk: { which: string; text: string; rotated: boolean }) => void) => {
    ipcRenderer.on("log-viewer:chunk", (_e, chunk) => cb(chunk));
  },
  onTheme: (cb: (payload: unknown) => void) =>
    ipcRenderer.on("theme:changed", (_e, payload) => cb(payload)),
});
