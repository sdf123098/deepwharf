// Main window shell: Codex-style session sidebar + embedded Harness webview.
"use strict";

const params = new URLSearchParams(location.search);
const PORT = params.get("port");
const LANG = params.get("lang") || "en-US";

const I18N = {
  "zh-CN": { loading: "加载会话…", empty: "还没有会话\n点下方按钮新建", newSession: "＋ 新建会话",
    newWorkspace: "＋ 工作区", wsEmpty: "（空工作区）", noWsPrompt: "还没有工作区。会话建立在工作区内，先创建一个？",
    running: "运行中", unknown: "未命名会话",
    rename: "重命名", fork: "复制会话", archive: "归档",
    renamePrompt: "新会话标题：", archiveConfirm: "归档该会话？归档后从列表隐藏，可在 Web UI 设置中恢复。",
    renameWs: "重命名工作区", deleteWs: "删除工作区", renameWsPrompt: "新工作区标题：",
    deleteWsConfirm: "删除该工作区？其会话将一并归档。", newWsPrompt: "工作区路径（绝对路径）：",
    opFailed: "操作失败：{error}", cancel: "取消", ok: "确定" },
  "en-US": { loading: "Loading sessions…", empty: "No sessions yet\nCreate one below", newSession: "＋ New session",
    newWorkspace: "＋ Workspace", running: "running", unknown: "Untitled",
    rename: "Rename", fork: "Duplicate", archive: "Archive",
    renamePrompt: "New session title:", archiveConfirm: "Archive this session? It leaves the list and can be restored in the web UI settings.",
    renameWs: "Rename workspace", deleteWs: "Delete workspace", renameWsPrompt: "New workspace title:",
    deleteWsConfirm: "Delete this workspace? Its sessions are archived with it.", newWsPrompt: "Workspace path (absolute):",
    opFailed: "Operation failed: {error}", cancel: "Cancel", ok: "OK" },
};
const S = I18N[LANG] || I18N["en-US"];

// Embed the live Harness WebUI (same-origin inside the guest webview).
const wv = document.getElementById("harness");
let currentPort = PORT;
wv.setAttribute("src", `http://127.0.0.1:${PORT}/`);

// Harness restarts on a fresh port: repoint the webview there instead of
// replacing the shell page (the shell must outlive harness restarts).
window.shellApi.onHarnessPort((port) => {
  if (Number.isInteger(port) && port > 0) {
    currentPort = port;
    wv.setAttribute("src", `http://127.0.0.1:${port}/`);
  }
});

// --- companion bridge relay ---------------------------------------------------
// The deepwharf-companion plugin talks to the shell through the guest
// preload's sendToHost channel; this page relays between the guest and the
// main process. Only companion-tagged payloads pass, and the main process
// whitelists every field before anything touches settings.
wv.addEventListener("ipc-message", (e) => {
  if (e.channel !== "deepwharf:relay") return;
  const d = e.args && e.args[0];
  if (!d || typeof d !== "object" || d.source !== "deepwharf-companion") return;
  window.shellApi.webuiEvent(d);
});
window.shellApi.onWebuiCommand((cmd) => {
  if (!cmd || typeof cmd !== "object") return;
  try {
    wv.send("deepwharf:command", cmd);
  } catch {
    // guest not ready — commands are replayed after the next load anyway
  }
});

// --- session sidebar ----------------------------------------------------------

const sessionList = document.getElementById("sessionList");
let sessions = [];
let workspaces = [];
let activeSessionId = null;
let selectedWorkspace = null; // workspaceId — new sessions land here

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function timeAgo(ts) {
  if (!ts) return "";
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h";
  return Math.floor(h / 24) + "d";
}

// Live elapsed-time tickers for running sessions. The relative "updatedAt"
// label is computed at render time and no events fire while a task streams, so
// without this it would stay frozen on "0s" for the whole run. A 1s interval
// updates only these spans — never a full re-render.
const runningTickers = new Map(); // sessionId -> { el, ts }

function renderSessions() {
  runningTickers.clear();
  // The web UI's own catalog hides blank + archived sessions — the desktop
  // sidebar mirrors that (archived filtering happens in the main process).
  const visible = sessions.filter((s) => !s.blank);
  sessionList.textContent = "";
  const byWorkspace = new Map();
  for (const s of visible) {
    const key = s.cwd || "";
    if (!byWorkspace.has(key)) byWorkspace.set(key, []);
    byWorkspace.get(key).push(s);
  }
  // Workspaces come first (empty ones included); sessions live under them.
  const wsById = new Map(workspaces.map((w) => [w.workspaceId, w]));
  if (workspaces.length === 0 && visible.length === 0) {
    sessionList.innerHTML = `<div class="sessEmpty">${esc(S.empty)}</div>`;
    return;
  }
  const groups = new Map(); // path -> {ws, rows}
  for (const w of workspaces) {
    groups.set(w.path || "", { ws: w, rows: byWorkspace.get(w.path || "") || [] });
  }
  // Sessions whose cwd has no registered workspace group under "未分组".
  for (const [path, rows] of byWorkspace) {
    if (!groups.has(path)) groups.set(path, { ws: null, rows });
  }
  for (const [path, { ws, rows }] of groups) {
    const group = document.createElement("div");
    group.className = "sessGroup";
    const head = document.createElement("div");
    head.className = "sessGroupHead" + (ws && selectedWorkspace === ws.workspaceId ? " selected" : "");
    const label = (ws && ws.title ? ws.title : path || S.unknown).slice(0, 40);
    head.innerHTML = `<span class="g-title">${esc(label)}</span>
      ${ws ? `<button class="g-new" data-ws-new="${esc(ws.workspaceId)}" title="在该工作区新建会话" aria-label="在该工作区新建会话">＋</button>` : ""}
      ${ws ? `<button class="g-menu" data-ws-menu="${esc(ws.workspaceId)}" title="工作区操作" aria-label="工作区操作">⋯</button>` : ""}`;
    if (ws) {
      head.addEventListener("click", (e) => {
        if (e.target.closest("[data-ws-menu]") || e.target.closest("[data-ws-new]")) return;
        selectedWorkspace = ws.workspaceId;
        renderSessions();
      });
    }
    group.append(head);
    if (rows.length === 0) {
      const empty = document.createElement("div");
      empty.className = "sessEmpty small";
      empty.textContent = S.wsEmpty;
      group.append(empty);
    }
    for (const s of rows) {
      const row = document.createElement("button");
      row.className = "sess" + (s.sessionId === activeSessionId ? " active" : "");
      const title = (s.title || S.unknown).slice(0, 60);
      const meta = [s.running ? S.running : ""].filter(Boolean).join(" · ")
        + (s.updatedAt ? " · " + timeAgo(s.updatedAt) : "");
      row.innerHTML = `
        <span class="dot${s.running ? " run" : ""}"></span>
        <span class="body"><span class="t">${esc(title)}</span>
        ${meta ? `<span class="m">${esc(meta)}</span>` : ""}</span>
        <span class="sessMenu" data-sess-menu="${esc(s.sessionId)}" title="会话操作" aria-label="会话操作">⋯</span>`;
      row.addEventListener("click", (e) => {
        if (e.target.closest("[data-sess-menu]")) return; // menu button, not open
        activeSessionId = s.sessionId;
        renderSessions();
        window.shellApi.openSession(s.sessionId);
      });
      if (s.running && s.updatedAt) {
        const m = row.querySelector(".m");
        if (m) runningTickers.set(s.sessionId, { el: m, ts: s.updatedAt });
      }
      group.append(row);
    }
    sessionList.append(group);
  }
}

// --- context menus (session / workspace actions, migrated from web UI) ---------

function showMenu(x, y, items) {
  closeMenu();
  const menu = document.createElement("div");
  menu.className = "dwMenu";
  menu.style.left = Math.min(x, sidebar.clientWidth - 150) + "px";
  menu.style.top = y + "px";
  for (const it of items) {
    const b = document.createElement("button");
    b.textContent = it.label;
    if (it.danger) b.className = "danger";
    b.addEventListener("click", () => {
      closeMenu();
      it.run();
    });
    menu.append(b);
  }
  document.body.append(menu);
  setTimeout(() => document.addEventListener("click", closeMenu, { once: true }), 0);
}
function closeMenu() {
  document.querySelector(".dwMenu")?.remove();
}

sessionList.addEventListener("click", async (e) => {
  const sessMenu = e.target.closest("[data-sess-menu]");
  if (sessMenu) {
    e.stopPropagation();
    const id = sessMenu.dataset.sessMenu;
    const rect = sessMenu.getBoundingClientRect();
    showMenu(rect.right - 140, rect.bottom + 2, [
      { label: S.rename, run: () => doRenameSession(id) },
      { label: S.fork, run: () => doForkSession(id) },
      { label: S.archive, danger: true, run: () => doArchiveSession(id) },
    ]);
    return;
  }
  const wsMenu = e.target.closest("[data-ws-menu]");
  if (wsMenu) {
    e.stopPropagation();
    const wsId = wsMenu.dataset.wsMenu;
    if (!wsId) return;
    const rect = wsMenu.getBoundingClientRect();
    showMenu(rect.right - 140, rect.bottom + 2, [
      { label: S.renameWs, run: () => doRenameWorkspace(wsId) },
      { label: S.deleteWs, danger: true, run: () => doDeleteWorkspace(wsId) },
    ]);
    return;
  }
  const wsNew = e.target.closest("[data-ws-new]");
  if (wsNew) {
    e.stopPropagation();
    const wsId = wsNew.dataset.wsNew;
    const ws = workspaces.find((w) => w.workspaceId === wsId);
    if (!ws) return;
    const id = await window.shellApi.newSession(ws.workspaceId);
    if (id) {
      activeSessionId = id;
      selectedWorkspace = wsId;
      renderSessions();
      window.shellApi.openSession(id);
    }
  }
});

async function doRenameSession(id) {
  const title = await promptDialog(S.renamePrompt, "");
  if (!title) return;
  await window.shellApi.sessionRename(id, title);
}
async function doForkSession(id) {
  const r = await window.shellApi.sessionFork(id);
  if (r && r.ok && r.value && r.value.sessionId) {
    window.shellApi.openSession(r.value.sessionId);
  }
}
async function doArchiveSession(id) {
  if (!confirm(S.archiveConfirm)) return;
  await window.shellApi.sessionArchive(id);
  if (activeSessionId === id) activeSessionId = null;
}
async function doRenameWorkspace(wsId) {
  const title = await promptDialog(S.renameWsPrompt, "");
  if (!title) return;
  await window.shellApi.workspaceRename(wsId, title);
}
async function doDeleteWorkspace(wsId) {
  if (!confirm(S.deleteWsConfirm)) return;
  await window.shellApi.workspaceDelete(wsId);
}

window.shellApi.onSessions((payload) => {
  if (payload && typeof payload === "object" && Array.isArray(payload.sessions)) {
    sessions = payload.sessions;
    workspaces = Array.isArray(payload.workspaces) ? payload.workspaces : [];
  } else {
    sessions = Array.isArray(payload) ? payload : [];
    workspaces = [];
  }
  renderSessions();
});

// New-workspace path: prefer the native folder picker; fall back to typing a
// path if the picker is unavailable, and stay silent when the user cancels.
async function pickWorkspacePath() {
  try {
    const picked = await window.shellApi.pickDirectory();
    if (picked && picked.ok && picked.path) return picked.path;
    if (picked && picked.canceled) return "";
  } catch (err) {
    console.error("pickDirectory failed:", err);
  }
  return promptDialog(S.newWsPrompt, "");
}

document.getElementById("btnNewSession").addEventListener("click", async () => {
  // Workspace-first: a conversation lives inside a workspace. Pick a target —
  // the selected workspace, else the first one; create one first if none.
  let ws = workspaces.find((w) => w.workspaceId === selectedWorkspace) ?? workspaces[0];
  if (!ws) {
    if (!confirm(S.noWsPrompt)) return;
    const path = await pickWorkspacePath();
    if (!path) return;
    const r = await window.shellApi.workspaceCreate(path);
    if (!r || !r.ok) {
      alert(S.opFailed.replace("{error}", (r && r.error) || "?"));
      return;
    }
    const created = r.value && r.value.workspace;
    ws = { workspaceId: created ? created.workspaceId : null, path };
    selectedWorkspace = ws.workspaceId;
    renderSessions();
  } else {
    selectedWorkspace = ws.workspaceId;
    renderSessions();
  }
  const id = await window.shellApi.newSession(ws.workspaceId);
  if (id) {
    activeSessionId = id;
    renderSessions();
    window.shellApi.openSession(id);
  }
});
document.getElementById("btnNewWorkspace").addEventListener("click", async () => {
  const path = await pickWorkspacePath();
  if (!path) return;
  const r = await window.shellApi.workspaceCreate(path);
  if (!r || !r.ok) {
    alert(S.opFailed.replace("{error}", (r && r.error) || "?"));
    return;
  }
  const created = r.value && r.value.workspace;
  if (created && created.workspaceId) selectedWorkspace = created.workspaceId;
  renderSessions();
});

// --- prompt modal (Electron's window.prompt is a silent no-op) -----------------

let promptResolve = null;
document.getElementById("dwPromptCancel").textContent = S.cancel;
document.getElementById("dwPromptOk").textContent = S.ok;
document.getElementById("dwPromptOk").addEventListener("click", () => {
  const v = document.getElementById("dwPromptInput").value.trim();
  document.getElementById("dwPrompt").hidden = true;
  if (promptResolve) promptResolve(v || null);
});
document.getElementById("dwPromptCancel").addEventListener("click", () => {
  document.getElementById("dwPrompt").hidden = true;
  if (promptResolve) promptResolve(null);
});
function promptDialog(title, placeholder) {
  return new Promise((resolve) => {
    promptResolve = resolve;
    document.getElementById("dwPromptTitle").textContent = title;
    const input = document.getElementById("dwPromptInput");
    input.value = placeholder || "";
    input.onkeydown = (e) => {
      if (e.key === "Enter") document.getElementById("dwPromptOk").click();
      else if (e.key === "Escape") document.getElementById("dwPromptCancel").click();
    };
    document.getElementById("dwPrompt").hidden = false;
    input.focus();
    input.select();
  });
}

// Sidebar collapse (persisted per partition; survives shell reloads).
const sidebar = document.getElementById("sidebar");
const collapseBtn = document.getElementById("btnCollapse");
const expandBtn = document.getElementById("btnExpand");
function setCollapsed(collapsed) {
  sidebar.classList.toggle("collapsed", collapsed);
  document.body.classList.toggle("sidebar-collapsed", collapsed); // drives #btnExpand
  try {
    localStorage.setItem("dw.sidebar", collapsed ? "1" : "0");
  } catch {
    // file:// storage unavailable — session-only
  }
}
collapseBtn.addEventListener("click", () => setCollapsed(!sidebar.classList.contains("collapsed")));
expandBtn.addEventListener("click", () => setCollapsed(false));
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.shiftKey && (e.key === "S" || e.key === "s")) {
    e.preventDefault();
    setCollapsed(!sidebar.classList.contains("collapsed"));
  }
});
try {
  setCollapsed(localStorage.getItem("dw.sidebar") === "1");
} catch {
  // ignore
}

// Sidebar head actions (icons in the rail header).
document.getElementById("btnStore").addEventListener("click", () => window.shellApi.openStore());
document.getElementById("btnSettings").addEventListener("click", () => window.shellApi.openSettings());
document.getElementById("btnWebuiSettings").addEventListener("click", () => window.shellApi.openWebuiSettings());

// Prime the list; the main process pushes updates from the event watcher.
window.shellApi.sessions().then((payload) => {
  if (payload && typeof payload === "object" && Array.isArray(payload.sessions)) {
    sessions = payload.sessions;
    workspaces = Array.isArray(payload.workspaces) ? payload.workspaces : [];
  } else {
    sessions = Array.isArray(payload) ? payload : [];
  }
  renderSessions();
});

// Tick the "运行中 · <elapsed>" labels once per second while any session runs.
setInterval(() => {
  if (runningTickers.size === 0) return;
  for (const [id, t] of runningTickers) {
    if (!t.el.isConnected) {
      runningTickers.delete(id);
      continue;
    }
    t.el.textContent = `${S.running} · ${timeAgo(t.ts)}`;
  }
}, 1000);
