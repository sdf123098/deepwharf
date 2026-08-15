// Plugin Store renderer. Talks to the main process through the preload bridge.
"use strict";

const LANG = new URLSearchParams(location.search).get("lang") || "en-US";
const I18N = {
  "zh-CN": {
    title: "插件商店",
    search: "搜索",
    placeholder: "搜索插件（名称 / 关键词）…",
    installing: "安装中…",
    installed: "已安装",
    install: "安装",
    restartActivate: "插件已安装，重启 Harness 后生效。立即重启？",
    restart: "重启",
    error: "操作失败：",
    empty: "没有找到插件。换个关键词试试。",
    loading: "加载中…",
    count: "共 {n} 个插件",
    tagPlugin: "DSH 插件",
    tagNotPlugin: "非 Harness 插件",
    footer: "数据源：npm registry（DeepSeek Harness 插件生态，GitHub dsh-plugin 主题）",
  },
  "en-US": {
    title: "Plugin Store",
    search: "Search",
    placeholder: "Search plugins (name / keyword)…",
    installing: "Installing…",
    installed: "Installed",
    install: "Install",
    restartActivate: "Plugin installed. Restart Harness to activate it?",
    restart: "Restart",
    error: "Operation failed: ",
    empty: "No plugins found. Try another keyword.",
    loading: "Loading…",
    count: "{n} plugins",
    tagPlugin: "DSH plugin",
    tagNotPlugin: "Not a Harness plugin",
    footer: "Source: npm registry (DeepSeek Harness plugin ecosystem, GitHub dsh-plugin topic)",
  },
};
const S = I18N[LANG] || I18N["en-US"];

document.title = S.title;
document.getElementById("title").textContent = S.title;
document.getElementById("searchBtn").textContent = S.search;
document.getElementById("q").placeholder = S.placeholder;
document.getElementById("footer").textContent = S.footer;

const listEl = document.getElementById("list");
const metaEl = document.getElementById("meta");
let installed = new Set();

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

async function refreshInstalled() {
  try {
    installed = new Set(await window.pluginApi.installed());
  } catch {
    installed = new Set();
  }
}

function render(plugins) {
  if (!plugins.length) {
    listEl.innerHTML = `<div class="empty">${esc(S.empty)}</div>`;
    return;
  }
  metaEl.textContent = S.count.replace("{n}", String(plugins.length));
  listEl.innerHTML = plugins
    .map(
      (p) => `
    <div class="card">
      <div class="body">
        <h3><code>${esc(p.name)}</code> <span class="sub">v${esc(p.version)}</span></h3>
        <p class="desc">${esc(p.description)}</p>
        <div class="sub">${esc(p.author)} · ${esc(p.date ? p.date.slice(0, 10) : "")}
          ${p.repository ? `<a href="#" data-url="${esc(p.repository)}">↗</a>` : ""}</div>
      </div>
      <div class="actions">
        <span class="tag ${p.dshBundle ? "ok" : "warn"}">${
          p.dshBundle ? esc(S.tagPlugin) : esc(S.tagNotPlugin)
        }</span>
        <button data-pkg="${esc(p.name)}" class="${installed.has(p.name) ? "done" : ""}"
          ${installed.has(p.name) || !p.dshBundle ? "disabled" : ""}>${
            installed.has(p.name) ? esc(S.installed) : esc(S.install)
          }</button>
      </div>
    </div>`,
    )
    .join("");
}

async function doSearch() {
  const q = document.getElementById("q").value.trim() || "dsh-plugin";
  listEl.innerHTML = `<div class="empty">${esc(S.loading)}</div>`;
  metaEl.textContent = "";
  try {
    const plugins = await window.pluginApi.search(q, 0);
    await refreshInstalled();
    render(plugins);
  } catch (e) {
    listEl.innerHTML = `<div class="err">${esc(S.error)}${esc(e.message)}</div>`;
  }
}

listEl.addEventListener("click", async (e) => {
  const repo = e.target.closest("a[data-url]");
  if (repo) {
    e.preventDefault();
    // Main validates the URL (https only) before handing it to the OS browser.
    await window.pluginApi.openExternal(repo.dataset.url);
    return;
  }
  const btn = e.target.closest("button[data-pkg]");
  if (!btn || btn.disabled) return;
  const pkg = btn.dataset.pkg;
  btn.disabled = true;
  btn.textContent = S.installing;
  try {
    await window.pluginApi.install(pkg);
    btn.textContent = S.installed;
    installed.add(pkg);
    if (confirm(S.restartActivate)) {
      await window.pluginApi.restart();
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = S.install;
    alert(S.error + err.message);
  }
});

document.getElementById("searchBtn").addEventListener("click", doSearch);
document.getElementById("q").addEventListener("keydown", (e) => {
  if (e.key === "Enter") doSearch();
});

doSearch();
