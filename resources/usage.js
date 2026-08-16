// Usage panel renderer: cache hit rate, context pressure, token buckets.
"use strict";

const LANG = new URLSearchParams(location.search).get("lang") || "en-US";
const I18N = {
  "zh-CN": {
    title: "用量",
    refresh: "刷新",
    pickSession: "选择会话…",
    noSessions: "还没有会话。在主窗口发起一个任务后，这里会实时显示它的 token 用量。",
    noUsage: "该会话还没有用量数据（跑一个任务后出现）。",
    live: "运行中 · 实时",
    hitRate: "缓存命中率",
    hitRateHint: "命中读取 ÷ 全部输入",
    noHit: "暂无输入",
    context: "上下文占用",
    contextOf: "{used} / {win}",
    contextUnknown: "{used} · 窗口未知",
    contextLegend: "按下次请求的预计占用计算；接近上限时考虑 /compact。",
    totalIn: "输入合计",
    cacheRead: "缓存命中",
    cacheWrite: "缓存写入",
    uncached: "未命中输入",
    output: "输出",
    composition: "输入构成",
    emptyBar: "等待数据…",
    footnote: "数据来自 Harness 官方 token-meter 投影，随会话实时刷新。",
  },
  "en-US": {
    title: "Usage",
    refresh: "Refresh",
    pickSession: "Pick a session…",
    noSessions: "No sessions yet. Start a task in the main window and its token usage will stream here live.",
    noUsage: "This session has no usage data yet (appears after the first turn).",
    live: "Running · live",
    hitRate: "Cache hit rate",
    hitRateHint: "cache reads ÷ all input",
    noHit: "no input yet",
    context: "Context occupancy",
    contextOf: "{used} / {win}",
    contextUnknown: "{used} · window unknown",
    contextLegend: "Based on projected next-request occupancy; consider /compact near the limit.",
    totalIn: "Total input",
    cacheRead: "Cache hits",
    cacheWrite: "Cache writes",
    uncached: "Uncached input",
    output: "Output",
    composition: "Input composition",
    emptyBar: "waiting for data…",
    footnote: "Data comes from the official Harness token-meter projection, live per session.",
  },
};
const S = I18N[LANG] || I18N["en-US"];

const $ = (id) => document.getElementById(id);
document.title = S.title;
$("title").textContent = S.title;
$("refresh").textContent = S.refresh;
$("liveText").textContent = S.live;
$("footnote").textContent = S.footnote;

// --- tiny formatters (mirror of pure.ts, kept for the live view) ---------------

function fmtTokens(n) {
  n = Number.isFinite(n) && n > 0 ? n : 0;
  if (n < 1000) return String(Math.round(n));
  const units = [[1e9, "B"], [1e6, "M"], [1e3, "K"]];
  for (const [size, suffix] of units) {
    if (n >= size) {
      const v = n / size;
      return (v >= 100 ? v.toFixed(0) : v.toFixed(1)) + suffix;
    }
  }
  return String(n);
}
function hitRate(u) {
  if (!u) return null;
  const input = u.cacheReadTokens + u.cacheWriteTokens + u.uncachedInputTokens;
  return input > 0 ? u.cacheReadTokens / input : null;
}
function pct(x) {
  return (x * 100).toFixed(x >= 0.995 ? 0 : 1) + "%";
}

// --- state ----------------------------------------------------------------------

let sessions = [];
let selected = null;
let usage = null;
let pressure = null;

function parseUsage(v) {
  if (!v || typeof v !== "object") return null;
  const o = v;
  const out = { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  for (const k of Object.keys(out)) {
    if (typeof o[k] !== "number" || !Number.isFinite(o[k]) || o[k] < 0) return null;
    out[k] = o[k];
  }
  return out;
}
function parsePressure(v) {
  if (!v || typeof v !== "object") return null;
  const used = typeof v.projectedTokens === "number" ? v.projectedTokens
    : typeof v.pressureTokens === "number" ? v.pressureTokens : undefined;
  const win = typeof v.contextWindow === "number" ? v.contextWindow : undefined;
  return used === undefined && win === undefined ? null : { used, win };
}

// --- rendering ------------------------------------------------------------------

const RING_R = 56;
const RING_C = 2 * Math.PI * RING_R;

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function render() {
  const body = $("body");
  const row = sessions.find((s) => s.sessionId === selected);
  $("live").style.display = row?.running ? "inline-flex" : "none";
  if (!row) {
    body.innerHTML = `<div class="empty">${esc(S.noSessions)}</div>`;
    return;
  }
  if (!usage && !row.usage) {
    body.innerHTML = `<div class="empty">${esc(S.noUsage)}</div>`;
    return;
  }
  const u = usage ?? row.usage ?? { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const p = pressure ?? row.pressure ?? null;
  const rate = hitRate(u);
  const rateFrac = rate === null ? 0 : Math.min(1, Math.max(0, rate));
  const dash = RING_C * (1 - rateFrac);

  const ctxPct = p && p.used !== undefined && p.win ? Math.min(1, p.used / p.win) : null;
  const ctxText = p && p.used !== undefined
    ? (p.win ? S.contextOf.replace("{used}", fmtTokens(p.used)).replace("{win}", fmtTokens(p.win))
             : S.contextUnknown.replace("{used}", fmtTokens(p.used)))
    : "—";
  const ctxFill = ctxPct === null ? 0 : Math.round(ctxPct * 100);
  const ctxWarn = ctxPct !== null && ctxPct >= 0.8;

  const input = u.cacheReadTokens + u.cacheWriteTokens + u.uncachedInputTokens;
  const total = input + u.outputTokens;
  const share = (x) => (total > 0 ? Math.round((x / total) * 100) : 0);
  const inputShare = (x) => (input > 0 ? (x / input) : 0);

  body.innerHTML = `
  <div class="hero">
    <div class="ringcard">
      <div class="ring">
        <svg width="132" height="132" viewBox="0 0 132 132">
          <circle class="track" cx="66" cy="66" r="${RING_R}" fill="none" stroke-width="11"/>
          <circle class="arc" cx="66" cy="66" r="${RING_R}" fill="none" stroke-width="11"
                  stroke-linecap="round" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}"/>
        </svg>
        <div class="val"><b>${rate === null ? "—" : pct(rate)}</b><span>${rate === null ? esc(S.noHit) : ""}</span></div>
      </div>
      <div class="sub">${esc(S.hitRate)} · ${esc(S.hitRateHint)}</div>
    </div>
    <div class="ctx">
      <div class="label"><span>${esc(S.context)}</span><b>${esc(ctxText)}</b></div>
      <div class="bar${ctxWarn ? " warn" : ""}"><i style="width:${ctxFill}%"></i></div>
      <div class="legend">${esc(S.contextLegend)}</div>
    </div>
  </div>
  <div class="cards">
    ${card(S.cacheRead, fmtTokens(u.cacheReadTokens), share(u.cacheReadTokens), "var(--hit)")}
    ${card(S.uncached, fmtTokens(u.uncachedInputTokens), share(u.uncachedInputTokens), "var(--miss)")}
    ${card(S.cacheWrite, fmtTokens(u.cacheWriteTokens), share(u.cacheWriteTokens), "var(--write)")}
    ${card(S.output, fmtTokens(u.outputTokens), share(u.outputTokens), "var(--out)")}
  </div>
  <div class="comp">
    <div class="label">${esc(S.composition)}${input > 0 ? "" : " · " + esc(S.emptyBar)}</div>
    <div class="stack">
      <i style="width:${(inputShare(u.cacheReadTokens) * 100).toFixed(2)}%;background:var(--hit)"></i><i style="width:${(inputShare(u.cacheWriteTokens) * 100).toFixed(2)}%;background:var(--write)"></i><i style="width:${(inputShare(u.uncachedInputTokens) * 100).toFixed(2)}%;background:var(--miss)"></i>
    </div>
    <div class="legend">
      <em><i style="background:var(--hit)"></i>${esc(S.cacheRead)} <b>${input > 0 ? pct(inputShare(u.cacheReadTokens)) : "—"}</b></em>
      <em><i style="background:var(--write)"></i>${esc(S.cacheWrite)} <b>${input > 0 ? pct(inputShare(u.cacheWriteTokens)) : "—"}</b></em>
      <em><i style="background:var(--miss)"></i>${esc(S.uncached)} <b>${input > 0 ? pct(inputShare(u.uncachedInputTokens)) : "—"}</b></em>
    </div>
  </div>`;

  // animate the ring from 0 to its value on the next frame
  const arc = body.querySelector(".arc");
  requestAnimationFrame(() => requestAnimationFrame(() => {
    arc.style.strokeDashoffset = String(dash);
  }));
}

function card(label, value, sharePct, color) {
  return `<div class="card">
    <div class="k"><i style="background:${color}"></i>${esc(label)}</div>
    <div class="v">${esc(value)}</div>
    <div class="m"><i style="width:${sharePct}%;background:${color}"></i></div>
  </div>`;
}

// --- session selector ------------------------------------------------------------

function fillSelect() {
  const sel = $("session");
  sel.textContent = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = S.pickSession;
  sel.append(placeholder);
  for (const s of sessions) {
    const opt = document.createElement("option");
    opt.value = s.sessionId;
    const label = (s.title || S.pickSession).slice(0, 40);
    opt.textContent = s.running ? `● ${label}` : label;
    sel.append(opt);
  }
  sel.value = selected ?? "";
}

async function load() {
  const r = await window.usageApi.snapshot();
  if (!r.ok) return;
  sessions = r.items.filter((s) => !s.blank);
  if (!sessions.find((s) => s.sessionId === selected)) {
    const running = sessions.find((s) => s.running && s.usage);
    const withUsage = sessions.find((s) => s.usage);
    selected = (running ?? withUsage ?? sessions[0])?.sessionId ?? null;
  }
  const row = sessions.find((s) => s.sessionId === selected);
  usage = row?.usage ? { ...row.usage } : null;
  pressure = row?.pressure ? { ...row.pressure } : null;
  fillSelect();
  render();
  await window.usageApi.watch(selected);
}

$("session").addEventListener("change", async (e) => {
  selected = e.target.value || null;
  const row = sessions.find((s) => s.sessionId === selected);
  usage = row?.usage ? { ...row.usage } : null;
  pressure = row?.pressure ? { ...row.pressure } : null;
  await window.usageApi.watch(selected);
  render();
});
$("refresh").addEventListener("click", load);

window.usageApi.onUpdate((u) => {
  if (u.sessionId !== selected) return;
  if (u.key === "tokenUsage") usage = parseUsage(u.value) ?? usage;
  if (u.key === "contextPressure") pressure = parsePressure(u.value) ?? pressure;
  render();
});

load();
