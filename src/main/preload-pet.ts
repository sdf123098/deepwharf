import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("petApi", {
  locale: () => ipcRenderer.invoke("pet:locale"),
  // Drag deltas (fire-and-forget — a promise per mousemove would lag).
  move: (dx: number, dy: number) => ipcRenderer.send("pet:move", dx, dy),
  contextMenu: () => ipcRenderer.send("pet:context-menu"),
  openMain: () => ipcRenderer.send("pet:open-main"),
  // Live usage text for the sign ("pet:usage"), watcher reactions, sign toggle.
  onUsage: (cb: (text: string) => void) =>
    ipcRenderer.on("pet:usage", (_e, text: string) => cb(text)),
  onPetEvent: (cb: (kind: string) => void) =>
    ipcRenderer.on("pet:event", (_e, kind: string) => cb(kind)),
  onSign: (cb: (visible: boolean) => void) =>
    ipcRenderer.on("pet:sign", (_e, visible: boolean) => cb(visible)),
});
