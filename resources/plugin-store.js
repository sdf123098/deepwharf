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
    searchHint: "输入关键词搜索插件（例如 dsh-plugin），或切换到 GitHub 社区源浏览 dsh-plugin 主题仓库。",
    loading: "加载中…",
    count: "共 {n} 个插件",
    tagPlugin: "DSH 插件",
    tagNotPlugin: "非 Harness 插件",
    tagRepo: "社区仓库",
    openRepo: "打开仓库",
    sourceLabel: "插件源",
    srcCustom: "自定义 (env)",
    srcNpmmirror: "npmmirror（国内镜像）",
    srcNpmjs: "npm 官方",
    srcAwesome: "社区精选（awesome-dsh-plugin）",
    srcGithub: "GitHub 社区（dsh-plugin）",
    footer: "可切换 npm registry、社区精选列表与 GitHub 主题源；仅声明 dsh.bundle 的包可安装。",
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
    searchHint: "Type a keyword to search plugins (e.g. dsh-plugin), or switch to the GitHub community source to browse dsh-plugin topic repositories.",
    loading: "Loading…",
    count: "{n} plugins",
    tagPlugin: "DSH plugin",
    tagNotPlugin: "Not a Harness plugin",
    tagRepo: "Community repo",
    openRepo: "Open repo",
    sourceLabel: "Source",
    srcCustom: "Custom (env)",
    srcNpmmirror: "npmmirror (CN mirror)",
    srcNpmjs: "npm official",
    srcAwesome: "Community curated (awesome-dsh-plugin)",
    srcGithub: "GitHub community (dsh-plugin)",
    footer: "Switch between npm registries, the curated community list and the GitHub topic; only packages declaring dsh.bundle are installable.",
  },
};
const S = I18N[LANG] || I18N["en-US"];

document.title = S.title;
document.getElementById("title").textContent = S.title;
document.getElementById("searchBtn").title = S.search;
document.getElementById("searchBtn").setAttribute("aria-label", S.search);
document.getElementById("q").placeholder = S.placeholder;
document.getElementById("footer").textContent = S.footer;

const listEl = document.getElementById("list");
const metaEl = document.getElementById("meta");
const progressEl = document.getElementById("progress");
const srcEl = document.getElementById("src");
let installed = new Set();
let currentSource = null;
let lastQuery = "";

const SOURCE_LABELS = {
  custom: S.srcCustom,
  npmmirror: S.srcNpmmirror,
  npmjs: S.srcNpmjs,
  awesome: S.srcAwesome,
  github: S.srcGithub,
};

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function showHint() {
  listEl.innerHTML = `<div class="empty">${esc(S.searchHint)}</div>`;
  metaEl.textContent = "";
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
    .map((p) => {
      const tag = p.installable
        ? `<span class="tag ${p.dshBundle ? "ok" : "warn"}">${
            p.dshBundle ? esc(S.tagPlugin) : esc(S.tagNotPlugin)
          }</span>`
        : `<span class="tag warn">${esc(p.category || S.tagRepo)}</span>`;
      const action = p.installable
        ? `<button data-pkg="${esc(p.name)}" class="${installed.has(p.name) ? "done" : ""}"
             ${installed.has(p.name) || !p.dshBundle ? "disabled" : ""}>${
               installed.has(p.name) ? esc(S.installed) : esc(S.install)
             }</button>`
        : `<button class="ghost" data-repo="${esc(p.repository)}">${esc(S.openRepo)}</button>`;
      return `
    <div class="card">
      <div class="body">
        <h3><code>${esc(p.name)}</code> <span class="sub">${p.version ? "v" + esc(p.version) : ""}</span></h3>
        <p class="desc">${esc(p.description)}</p>
        <div class="sub">${esc(p.author)} · ${esc(p.date ? p.date.slice(0, 10) : "")}
          ${p.repository ? `<a href="#" data-url="${esc(p.repository)}">↗</a>` : ""}</div>
      </div>
      <div class="actions">
        ${tag}
        ${action}
      </div>
    </div>`;
    })
    .join("");
}

async function doSearch() {
  const q = document.getElementById("q").value.trim();
  lastQuery = q;
  if (!q) {
    showHint();
    return;
  }
  listEl.innerHTML = `<div class="empty">${esc(S.loading)}</div>`;
  metaEl.textContent = "";
  try {
    const plugins = await window.pluginApi.search(q, 0, currentSource?.id);
    await refreshInstalled();
    render(plugins);
  } catch (e) {
    listEl.innerHTML = `<div class="err">${esc(S.error)}${esc(e.message)}</div>`;
  }
}

function clearProgress() {
  progressEl.innerHTML = "";
  progressEl.hidden = true;
}

listEl.addEventListener("click", async (e) => {
  const repo = e.target.closest("a[data-url]");
  if (repo) {
    e.preventDefault();
    await window.pluginApi.openExternal(repo.dataset.url);
    return;
  }
  const repoBtn = e.target.closest("button[data-repo]");
  if (repoBtn) {
    await window.pluginApi.openExternal(repoBtn.dataset.repo);
    return;
  }
  const btn = e.target.closest("button[data-pkg]");
  if (!btn || btn.disabled) return;
  const pkg = btn.dataset.pkg;
  btn.disabled = true;
  btn.textContent = S.installing;
  clearProgress();
  progressEl.hidden = false;
  try {
    await window.pluginApi.install(pkg, currentSource?.registry);
    clearProgress();
    btn.textContent = S.installed;
    installed.add(pkg);
    if (confirm(S.restartActivate)) {
      await window.pluginApi.restart();
    }
  } catch (err) {
    clearProgress();
    btn.disabled = false;
    btn.textContent = S.install;
    alert(S.error + err.message);
  }
});

// Live install/download progress from the main process (bounded tail).
window.pluginApi.onProgress((line) => {
  if (!line) return;
  progressEl.hidden = false;
  const div = document.createElement("div");
  div.textContent = line;
  progressEl.appendChild(div);
  while (progressEl.childElementCount > 8) progressEl.removeChild(progressEl.firstChild);
  progressEl.scrollTop = progressEl.scrollHeight;
});

async function initSources() {
  try {
    const sources = await window.pluginApi.sources();
    for (const s of sources) {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = SOURCE_LABELS[s.id] || s.id;
      srcEl.appendChild(opt);
    }
    currentSource = sources[0] ?? null;
    srcEl.addEventListener("change", () => {
      currentSource = sources.find((s) => s.id === srcEl.value) ?? sources[0] ?? null;
      doSearch();
    });
  } catch {
    currentSource = null;
  }
}

document.getElementById("searchBtn").addEventListener("click", doSearch);
document.getElementById("q").addEventListener("keydown", (e) => {
  if (e.key === "Enter") doSearch();
});

initSources().then(showHint);
