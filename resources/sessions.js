// Session history browser renderer.
"use strict";

const LANG = new URLSearchParams(location.search).get("lang") || "en-US";
const I18N = {
  "zh-CN": {
    title: "会话历史",
    searchPlaceholder: "全文搜索会话…",
    refresh: "刷新",
    showBlank: "显示空白会话",
    running: "运行中",
    untitled: "（未命名）",
    export: "导出",
    empty: "没有会话。",
    searchMore: "结果超过 20 条，仅显示前 20 条。",
    exportDone: "已导出：{path}",
    error: "操作失败：{error}",
    footer: "导出为 ZIP（session.jsonl + 子代理 + 图片附件），来自 Harness 官方 session.export。",
    timeNow: "刚刚", timeMin: "{n} 分钟前", timeHour: "{n} 小时前", timeDay: "{n} 天前",
  },
  "en-US": {
    title: "Session history",
    searchPlaceholder: "Full-text session search…",
    refresh: "Refresh",
    showBlank: "Show blank sessions",
    running: "Running",
    untitled: "(untitled)",
    export: "Export",
    empty: "No sessions.",
    searchMore: "More than 20 results; showing the first 20.",
    exportDone: "Exported: {path}",
    error: "Operation failed: {error}",
    footer: "Exports a ZIP (session.jsonl + subagents + media attachments) via the official Harness session.export.",
    timeNow: "just now", timeMin: "{n} min ago", timeHour: "{n} h ago", timeDay: "{n} d ago",
  },
};
const S = I18N[LANG] || I18N["en-US"];

const $ = (id) => document.getElementById(id);
document.title = S.title;
$("title").textContent = S.title;
$("q").placeholder = S.searchPlaceholder;
$("refresh").textContent = S.refresh;
$("lblBlank").textContent = S.showBlank;
$("footer").textContent = S.footer;

let allRows = [];

function relTime(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return S.timeNow;
  const m = Math.floor(s / 60);
  if (m < 60) return S.timeMin.replace("{n}", m);
  const h = Math.floor(m / 60);
  if (h < 24) return S.timeHour.replace("{n}", h);
  return S.timeDay.replace("{n}", Math.floor(h / 24));
}

function msg(text, cls) {
  const m = $("msg");
  m.className = "msg" + (cls ? " " + cls : "");
  m.textContent = text || "";
}

function fmtTokens(n) {
  n = Number.isFinite(n) && n > 0 ? n : 0;
  if (n < 1000) return String(Math.round(n));
  for (const [size, suffix] of [[1e9, "B"], [1e6, "M"], [1e3, "K"]]) {
    if (n >= size) {
      const v = n / size;
      return (v >= 100 ? v.toFixed(0) : v.toFixed(1)) + suffix;
    }
  }
  return String(n);
}
function usageBits(row) {
  if (!row.usage) return [];
  const u = row.usage;
  const total = u.cacheReadTokens + u.cacheWriteTokens + u.uncachedInputTokens + u.outputTokens;
  const input = u.cacheReadTokens + u.cacheWriteTokens + u.uncachedInputTokens;
  const hit = input > 0 ? "缓存 " + Math.round((u.cacheReadTokens / input) * 100) + "%" : null;
  const out = [fmtTokens(total) + " tok"];
  if (hit) out.push(hit);
  return out;
}

function rowEl(row) {
  const div = document.createElement("div");
  div.className = "row";
  const body = document.createElement("div");
  body.className = "body";
  const t = document.createElement("div");
  t.className = "t";
  t.textContent = row.title || S.untitled;
  const m = document.createElement("div");
  m.className = "m";
  const bits = [relTime(row.updatedAt)];
  if (row.cwd) bits.push(row.cwd);
  bits.push(...usageBits(row));
  m.textContent = bits.join(" · ");
  body.append(t, m);
  div.append(body);
  if (row.running) {
    const badge = document.createElement("span");
    badge.className = "badge running";
    badge.textContent = S.running;
    div.append(badge);
  }
  const btn = document.createElement("button");
  btn.textContent = S.export;
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    msg("");
    const r = await window.sessionsApi.export(row.sessionId);
    btn.disabled = false;
    if (r.ok) msg(S.exportDone.replace("{path}", r.path), "ok");
    else if (!r.cancelled) msg(S.error.replace("{error}", r.error || "?"), "err");
  });
  div.append(btn);
  return div;
}

function renderList(rows) {
  const list = $("list");
  list.textContent = "";
  if (rows.length === 0) {
    const d = document.createElement("div");
    d.className = "empty";
    d.textContent = S.empty;
    list.append(d);
    return;
  }
  for (const row of rows) list.append(rowEl(row));
}

async function load() {
  msg("");
  const r = await window.sessionsApi.list();
  if (!r.ok) {
    msg(S.error.replace("{error}", r.error || "?"), "err");
    return;
  }
  allRows = r.items;
  applyFilter();
}

function applyFilter() {
  renderList($("showBlank").checked ? allRows : allRows.filter((x) => !x.blank));
}

$("showBlank").addEventListener("change", applyFilter);
$("refresh").addEventListener("click", load);

let searchTimer = null;
$("q").addEventListener("input", (e) => {
  const q = e.target.value.trim();
  clearTimeout(searchTimer);
  if (q === "") {
    applyFilter();
    return;
  }
  searchTimer = setTimeout(async () => {
    msg("");
    const r = await window.sessionsApi.search(q);
    if (!r.ok) {
      msg(S.error.replace("{error}", r.error || "?"), "err");
      return;
    }
    const byId = new Map(allRows.map((x) => [x.sessionId, x]));
    const rows = r.items.map((hit) => {
      const base = byId.get(hit.sessionId);
      return (
        base ?? {
          sessionId: hit.sessionId,
          title: "",
          running: false,
          blank: false,
          cwd: undefined,
          agentPreset: undefined,
          updatedAt: 0,
        }
      );
    });
    renderList(rows);
    if (r.hasMore) msg(S.searchMore);
  }, 300);
});

load();
