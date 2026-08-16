import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("managerApi", {
  locale: () => ipcRenderer.invoke("plugin-manager:locale"),
  list: () => ipcRenderer.invoke("plugin-manager:list"),
  toggle: (name: string, disable: boolean) => ipcRenderer.invoke("plugin-manager:toggle", name, disable),
  remove: (name: string) => ipcRenderer.invoke("plugin-manager:remove", name),
  update: (name: string) => ipcRenderer.invoke("plugin-manager:update", name),
  restart: () => ipcRenderer.invoke("plugin-manager:restart"),
  mcpList: () => ipcRenderer.invoke("mcp:list"),
  mcpAdd: (server: Record<string, unknown>) => ipcRenderer.invoke("mcp:add", server),
  mcpToggle: (id: string, serverName: string, disable: boolean) =>
    ipcRenderer.invoke("mcp:toggle", id, serverName, disable),
  mcpRemove: (serverName: string) => ipcRenderer.invoke("mcp:remove", serverName),
  mcpOpenConfig: () => ipcRenderer.invoke("mcp:openConfig"),
  skillsList: () => ipcRenderer.invoke("skills:list"),
  skillsOpenDir: () => ipcRenderer.invoke("skills:openDir"),
  onProgress: (cb: (line: string) => void) => {
    ipcRenderer.on("plugin-manager:progress", (_e, line: string) => cb(line));
  },
  onTheme: (cb: (payload: unknown) => void) =>
    ipcRenderer.on("theme:changed", (_e, payload) => cb(payload)),
});
