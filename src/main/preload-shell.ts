import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("shellApi", {
  locale: () => ipcRenderer.invoke("shell:locale"),
  openStore: () => ipcRenderer.invoke("shell:openStore"),
  openSettings: () => ipcRenderer.invoke("shell:openSettings"),
  checkHarness: () => ipcRenderer.invoke("shell:checkHarness"),
  checkShell: () => ipcRenderer.invoke("shell:checkShell"),
  versions: () => ipcRenderer.invoke("shell:versions"),
  // Session sidebar.
  sessions: () => ipcRenderer.invoke("shell:sessions"),
  openSession: (id: string) => ipcRenderer.invoke("shell:session-open", id),
  newSession: (workspaceId?: string) => ipcRenderer.invoke("shell:session-new", workspaceId ?? ""),
  onSessions: (cb: (list: unknown) => void) => {
    ipcRenderer.on("shell:sessions", (_e, list) => cb(list));
  },
  openWebuiSettings: () => ipcRenderer.invoke("shell:webui-settings"),
  pickDirectory: () => ipcRenderer.invoke("shell:pick-directory"),
  workspaceList: () => ipcRenderer.invoke("shell:workspace-list"),
  workspaceCreate: (path: string) => ipcRenderer.invoke("shell:workspace-create", path),
  workspaceRename: (workspaceId: string, title: string) =>
    ipcRenderer.invoke("shell:workspace-rename", workspaceId, title),
  workspaceDelete: (workspaceId: string) => ipcRenderer.invoke("shell:workspace-delete", workspaceId),
  sessionArchive: (sessionId: string) => ipcRenderer.invoke("shell:session-archive", sessionId),
  sessionRename: (sessionId: string, title: string) =>
    ipcRenderer.invoke("shell:session-rename", sessionId, title),
  sessionFork: (sessionId: string) => ipcRenderer.invoke("shell:session-fork", sessionId),
  // Harness restarts on a fresh port; the shell page itself must stay alive.
  onHarnessPort: (cb: (port: number) => void) => {
    ipcRenderer.on("shell:harness-port", (_e, port: number) => cb(port));
  },
  onTheme: (cb: (payload: unknown) => void) =>
    ipcRenderer.on("theme:changed", (_e, payload) => cb(payload)),
  // Companion bridge: guest postMessage payloads in, theme commands out.
  webuiEvent: (payload: unknown) => ipcRenderer.invoke("shell:webui-event", payload),
  onWebuiCommand: (cb: (cmd: unknown) => void) =>
    ipcRenderer.on("shell:webui-command", (_e, cmd) => cb(cmd)),
});
