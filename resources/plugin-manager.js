// Plugin manager renderer: plugins / MCP / skills tabs.
"use strict";

const LANG = new URLSearchParams(location.search).get("lang") || "en-US";
const I18N = {
  "zh-CN": {
    title: "插件管理",
    tabs: { plugins: "插件", mcp: "MCP 服务器", skills: "技能" },
    refresh: "刷新",
    restart: "重启 Harness 生效",
    pluginsFootnote: "停用通过官方 cordis.patch.yml 的 disabled 覆盖实现（不卸载）；卸载/更新走官方 dsh plugin（pnpm）。变更后需重启。",
    mcpFootnote: "MCP 服务器即 profile 中的 dsh-mcp-client 实例；新增/停用/删除通过官方 cordis.patch.yml 补丁层，变更后需重启。",
    skillsFootnote: "技能按会话可见性列出（官方 skill.list）；技能文件位于 DSH_HOME/skills。",
    kindInbox: "内置", kindLayer: "插件层", kindPlain: "普通依赖",
    enabled: "已启用", disabledTag: "已停用", noEntries: "无配置条目",
    toggleOff: "停用", toggleOn: "启用", removeBtn: "卸载", updateBtn: "更新",
    confirmRemove: "确定卸载 {name}？", needRestart: "已变更。重启 Harness 后生效，现在重启？",
    emptyPlugins: "还没有安装任何插件。去插件商店安装。",
    mcpAddTitle: "新增 MCP 服务器",
    name: "名称（serverName）", transport: "传输",
    command: "命令 (command)", args: "参数（每行一个）", env: "环境变量（每行 KEY=VALUE）",
    url: "URL", headers: "请求头（每行 KEY: VALUE）",
    add: "添加", cancel: "取消",
    mcpEmpty: "还没有配置 MCP 服务器。",
    provided: "插件提供", ours: "可删除",
    deleteBtn: "删除",
    pluginProvidedMsg: "该服务器由插件提供，无法直接删除——已为你停用（可再启用）。",
    skillsOpenDir: "打开技能目录",
    skillsEmpty: "会话暂无可见技能。技能是 DSH_HOME/skills 下的 SKILL.md。",
    skillInvocable: "可被模型调用",
    error: "操作失败：{error}",
  },
  "en-US": {
    title: "Plugins",
    tabs: { plugins: "Plugins", mcp: "MCP servers", skills: "Skills" },
    refresh: "Refresh",
    restart: "Restart Harness to apply",
    pluginsFootnote: "Disable uses the official cordis.patch.yml disabled override (no uninstall); update/uninstall go through the official dsh plugin (pnpm). Restart after changes.",
    mcpFootnote: "An MCP server is a dsh-client instance in the profile; add/disable/remove ride the official cordis.patch.yml layer — restart after changes.",
    skillsFootnote: "Skills listed per-session visibility (official skill.list); skill files live in DSH_HOME/skills.",
    kindInbox: "built-in", kindLayer: "plugin layer", kindPlain: "plain dep",
    enabled: "enabled", disabledTag: "disabled", noEntries: "no entries",
    toggleOff: "Disable", toggleOn: "Enable", removeBtn: "Uninstall", updateBtn: "Update",
    confirmRemove: "Uninstall {name}?", needRestart: "Changed. Restart Harness to apply — restart now?",
    emptyPlugins: "No plugins installed yet — get some from the Plugin Store.",
    mcpAddTitle: "Add MCP server",
    name: "Name (serverName)", transport: "Transport",
    command: "Command", args: "Args (one per line)", env: "Env (KEY=VALUE per line)",
    url: "URL", headers: "Headers (KEY: VALUE per line)",
    add: "Add", cancel: "Cancel",
    mcpEmpty: "No MCP servers configured.",
    provided: "plugin-provided", ours: "removable",
    deleteBtn: "Delete",
    pluginProvidedMsg: "This server comes from a plugin and cannot be deleted — disabled it instead (re-enable anytime).",
    skillsOpenDir: "Open skills folder",
    skillsEmpty: "No skills visible to the session yet. Skills are SKILL.md folders under DSH_HOME/skills.",
    skillInvocable: "model-invocable",
    error: "Operation failed: {error}",
  },
};
const S = I18N[LANG] || I18N["en-US"];

const $ = (id) => document.getElementById(id);
document.title = S.title;
$("tabPlugins").textContent = S.tabs.plugins;
$("tabMcp").textContent = S.tabs.mcp;
$("tabSkills").textContent = S.tabs.skills;
$("refresh").textContent = S.refresh;
$("restart").textContent = S.restart;

let activeTab = "plugins";
let footnote = "";
let needRestartFlag = false;

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function msg(text, err) {
  const m = $("msg");
  m.className = "msg" + (err ? " err" : "");
  m.textContent = text || "";
}
function markChanged() {
  needRestartFlag = true;
  $("restart").style.display = "";
}
async function maybeRestart() {
  if (!needRestartFlag) return;
  if (confirm(S.needRestart)) {
    msg("");
    await window.managerApi.restart();
    needRestartFlag = false;
    $("restart").style.display = "none";
    load();
  }
}
$("restart").addEventListener("click", maybeRestart);
$("refresh").addEventListener("click", load);

// --- tabs --------------------------------------------------------------------------

for (const [id, key] of [["tabPlugins", "plugins"], ["tabMcp", "mcp"], ["tabSkills", "skills"]]) {
  $(id).addEventListener("click", () => {
    activeTab = key;
    $("tabPlugins").classList.toggle("active", key === "plugins");
    $("tabMcp").classList.toggle("active", key === "mcp");
    $("tabSkills").classList.toggle("active", key === "skills");
    $("panePlugins").style.display = key === "plugins" ? "" : "none";
    $("paneMcp").style.display = key === "mcp" ? "" : "none";
    $("paneSkills").style.display = key === "skills" ? "" : "none";
    $("footnote").textContent = key === "plugins" ? S.pluginsFootnote : key === "mcp" ? S.mcpFootnote : S.skillsFootnote;
    load();
  });
}
$("footnote").textContent = S.pluginsFootnote;

// --- plugins ------------------------------------------------------------------------

function pluginRow(p) {
  const isInbox = p.kind === "inbox";
  const state = isInbox
    ? `<span class="tag">${esc(S.kindInbox)}</span>`
    : p.entryCount === 0
      ? `<span class="tag">${esc(S.kindLayer === "" ? "" : p.kind === "plain" ? S.kindPlain : S.kindLayer)} · ${esc(S.noEntries)}</span>`
      : p.disabled
        ? `<span class="tag off">${esc(S.disabledTag)}</span>`
        : `<span class="tag ok">${esc(S.enabled)}</span>`;
  const kind = p.kind === "plain" ? S.kindPlain : S.kindLayer;
  const actions = isInbox ? "" : `
    <div class="actions">
      ${p.entryCount > 0 ? `<button class="act" data-toggle="${esc(p.name)}" data-disable="${p.disabled ? "0" : "1"}">${p.disabled ? esc(S.toggleOn) : esc(S.toggleOff)}</button>` : ""}
      <button class="act" data-update="${esc(p.name)}">${esc(S.updateBtn)}</button>
      <button class="act danger" data-remove="${esc(p.name)}">${esc(S.removeBtn)}</button>
    </div>`;
  return `<div class="row">
    <div class="body">
      <div class="t"><code>${esc(p.name)}</code> ${p.version ? `<span class="tag">${esc(p.version)}</span>` : ""} ${state}</div>
      <div class="m">${esc(p.spec || kind)}</div>
    </div>
    ${actions}
  </div>`;
}

async function loadPlugins() {
  const pane = $("panePlugins");
  const r = await window.managerApi.list();
  if (!r.items.length) {
    pane.innerHTML = `<div class="empty">${esc(S.emptyPlugins)}</div>`;
    return;
  }
  if (r.degraded) msg("dump-config 不可用，停用状态未知", true);
  pane.innerHTML = r.items.map(pluginRow).join("");
}

$("panePlugins").addEventListener("click", async (e) => {
  const toggle = e.target.closest("button[data-toggle]");
  if (toggle) {
    toggle.disabled = true;
    const r = await window.managerApi.toggle(toggle.dataset.toggle, toggle.dataset.disable === "1");
    toggle.disabled = false;
    if (!r.ok) { msg(S.error.replace("{error}", r.error || "?"), true); return; }
    msg(""); markChanged(); loadPlugins();
    return;
  }
  const update = e.target.closest("button[data-update]");
  if (update) {
    update.disabled = true;
    const r = await window.managerApi.update(update.dataset.update);
    if (!r.ok) { msg(S.error.replace("{error}", r.error || "?"), true); update.disabled = false; return; }
    msg(""); markChanged(); loadPlugins();
    return;
  }
  const remove = e.target.closest("button[data-remove]");
  if (remove) {
    if (!confirm(S.confirmRemove.replace("{name}", remove.dataset.remove))) return;
    remove.disabled = true;
    const r = await window.managerApi.remove(remove.dataset.remove);
    if (!r.ok) { msg(S.error.replace("{error}", r.error || "?"), true); remove.disabled = false; return; }
    msg(""); markChanged(); loadPlugins();
  }
});

// --- mcp ------------------------------------------------------------------------------

function mcpRow(m) {
  const target = m.command || m.url || "";
  const state = m.disabled ? `<span class="tag off">${esc(S.disabledTag)}</span>` : `<span class="tag ok">${esc(S.enabled)}</span>`;
  const src = m.ours ? `<span class="tag">${esc(S.ours)}</span>` : `<span class="tag">${esc(S.provided)}</span>`;
  return `<div class="row">
    <div class="body">
      <div class="t"><code>${esc(m.serverName)}</code> <span class="tag">${esc(m.transport)}</span> ${state} ${src}</div>
      <div class="m">${esc(target)}${m.argsCount ? " · " + m.argsCount + " args" : ""}</div>
    </div>
    <div class="actions">
      <button class="act" data-mcponoff="${esc(m.id)}|${esc(m.serverName)}|${m.disabled ? "0" : "1"}">${m.disabled ? esc(S.toggleOn) : esc(S.toggleOff)}</button>
      ${m.ours ? `<button class="act danger" data-mcpdel="${esc(m.serverName)}">${esc(S.deleteBtn)}</button>` : ""}
    </div>
  </div>`;
}

let addFormOpen = false;
let lastMcp = [];

function renderMcp() {
  const pane = $("paneMcp");
  const form = addFormOpen ? mcpFormHtml() : "";
  const list = lastMcp.length
    ? lastMcp.map(mcpRow).join("")
    : `<div class="empty">${esc(S.mcpEmpty)}</div>`;
  pane.innerHTML = `
    <div style="display:flex; gap:8px; margin-bottom:10px;">
      <button class="act primary" id="mcpAddToggle">${esc(S.mcpAddTitle)}</button>
      <button class="act" id="mcpOpenConfig">cordis.patch.yml</button>
    </div>
    ${form}
    ${list}`;
  $("mcpAddToggle").addEventListener("click", () => { addFormOpen = !addFormOpen; renderMcp(); });
  $("mcpOpenConfig").addEventListener("click", () => window.managerApi.mcpOpenConfig());
  const formEl = pane.querySelector("form");
  if (formEl) formEl.addEventListener("submit", onMcpAdd);
}

function mcpFormHtml() {
  return `<form class="add" id="mcpForm">
    <div class="grid">
      <label>${esc(S.name)}<input name="serverName" required pattern="[A-Za-z0-9][A-Za-z0-9_-]*"></label>
      <label>${esc(S.transport)}<select name="transport"><option value="stdio">stdio</option><option value="streamable-http">streamable-http</option></select></label>
    </div>
    <div class="grid" data-mode="stdio">
      <label class="full">${esc(S.command)}<input name="command" placeholder="npx -y ... 或 C:\\path\\to\\cmd"></label>
      <label>${esc(S.args)}<textarea name="args"></textarea></label>
      <label>${esc(S.env)}<textarea name="env"></textarea></label>
    </div>
    <div class="grid" data-mode="streamable-http" style="display:none">
      <label class="full">${esc(S.url)}<input name="url" placeholder="https://…/mcp"></label>
      <label class="full">${esc(S.headers)}<textarea name="headers"></textarea></label>
    </div>
    <div style="display:flex; gap:8px; justify-content:flex-end;">
      <button class="act" type="button" id="mcpCancel">${esc(S.cancel)}</button>
      <button class="act primary" type="submit">${esc(S.add)}</button>
    </div>
  </form>`;
}

function parseLines(text, sep) {
  const out = [];
  for (const line of String(text || "").split("\n")) {
    const t = line.trim();
    if (t === "") continue;
    if (sep === "=") {
      const i = t.indexOf("=");
      if (i > 0) out.push([t.slice(0, i).trim(), t.slice(i + 1)]);
    } else {
      const i = t.indexOf(":");
      if (i > 0) out.push([t.slice(0, i).trim(), t.slice(i + 1).trim()]);
    }
  }
  return out;
}

async function onMcpAdd(ev) {
  ev.preventDefault();
  const f = ev.target;
  const transport = f.transport.value;
  const server = {
    serverName: f.serverName.value,
    transport,
    command: f.command?.value ?? "",
    args: (f.args?.value ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
    env: Object.fromEntries(parseLines(f.env?.value, "=")),
    url: f.url?.value ?? "",
    headers: Object.fromEntries(parseLines(f.headers?.value, ":")),
  };
  const r = await window.managerApi.mcpAdd(server);
  if (!r.ok) { msg(S.error.replace("{error}", r.error || "?"), true); return; }
  msg(""); addFormOpen = false; markChanged(); loadMcp();
}

async function loadMcp() {
  const r = await window.managerApi.mcpList();
  if (!r.ok) { msg(S.error.replace("{error}", r.error || "?"), true); lastMcp = []; }
  else lastMcp = r.items;
  renderMcp();
}

$("paneMcp").addEventListener("click", async (e) => {
  const off = e.target.closest("button[data-mcponoff]");
  if (off) {
    const [id, serverName, disable] = off.dataset.mcponoff.split("|");
    const r = await window.managerApi.mcpToggle(id, serverName, disable === "1");
    if (!r.ok) { msg(S.error.replace("{error}", r.error || "?"), true); return; }
    msg(""); markChanged(); loadMcp();
    return;
  }
  const del = e.target.closest("button[data-mcpdel]");
  if (del) {
    const r = await window.managerApi.mcpRemove(del.dataset.mcpdel);
    if (!r.ok && r.pluginProvided) { msg(S.pluginProvidedMsg); markChanged(); loadMcp(); return; }
    if (!r.ok) { msg(S.error.replace("{error}", r.error || "?"), true); return; }
    msg(""); markChanged(); loadMcp();
    return;
  }
  const cancel = e.target.closest("#mcpCancel");
  if (cancel) { addFormOpen = false; renderMcp(); }
});

// transport switch between stdio / http field groups
$("paneMcp").addEventListener("change", (e) => {
  if (e.target.name !== "transport") return;
  const form = e.target.closest("form");
  form.querySelector('[data-mode="stdio"]').style.display = e.target.value === "stdio" ? "" : "none";
  form.querySelector('[data-mode="streamable-http"]').style.display = e.target.value === "streamable-http" ? "" : "none";
});

// --- skills ------------------------------------------------------------------------------

async function loadSkills() {
  const pane = $("paneSkills");
  const r = await window.managerApi.skillsList();
  const rows = (r.items || []).map((s) => `<div class="row">
      <div class="body">
        <div class="t"><code>${esc(s.name)}</code>${s.modelInvocable ? `<span class="tag ok">${esc(S.skillInvocable)}</span>` : ""}</div>
        <div class="m" style="white-space:normal; font-family:inherit;">${esc(s.description)}${s.whenToUse ? " · " + esc(s.whenToUse) : ""}</div>
      </div>
    </div>`).join("");
  pane.innerHTML = `
    <div style="display:flex; gap:8px; margin-bottom:10px;">
      <button class="act" id="skillsOpen">${esc(S.skillsOpenDir)}</button>
    </div>
    ${rows || `<div class="empty">${esc(S.skillsEmpty)}</div>`}`;
  $("skillsOpen").addEventListener("click", () => window.managerApi.skillsOpenDir());
}

// --- boot --------------------------------------------------------------------------------

async function load() {
  msg("");
  clearProgress();
  if (activeTab === "plugins") await loadPlugins();
  else if (activeTab === "mcp") await loadMcp();
  else await loadSkills();
}

function clearProgress() {
  const p = $("progress");
  p.innerHTML = "";
  p.hidden = true;
}
window.managerApi.onProgress((line) => {
  if (!line) return;
  const p = $("progress");
  p.hidden = false;
  const div = document.createElement("div");
  div.textContent = line;
  p.appendChild(div);
  while (p.childElementCount > 8) p.removeChild(p.firstChild);
  p.scrollTop = p.scrollHeight;
});

load();
