// Guest preload for the embedded Harness webview.
//
// The companion plugin (which runs inside the harness page's main world)
// needs a channel to the DeepWharf shell. postMessage to window.parent is a
// no-op here — a <webview> guest is its own top-level browsing context — so
// this preload bridges the main world to the embedder page via Electron's
// sendToHost/ipc-message pair. The embedder (main-shell.js) relays both
// directions to the main process.
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("deepwharfGuest", {
  // Companion → shell: forwards a structured-clone payload to the embedder.
  post: (msg) => ipcRenderer.sendToHost("deepwharf:relay", msg),
  // Shell → companion: commands (set-theme / ping) delivered from the embedder.
  onCommand: (cb) => {
    ipcRenderer.on("deepwharf:command", (_e, cmd) => cb(cmd));
  },
});
