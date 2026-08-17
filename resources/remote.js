// DeepWharf remote console: token-gated LAN control of the Harness agent.
"use strict";

const $ = (id) => document.getElementById(id);
const I18N = {
  "zh-CN": {
    gate: "访问令牌", gateHint: "在 DeepWharf 设置 → 远程控制 中查看或重新生成令牌。",
    connect: "连接", badToken: "令牌无效或服务未开启", loading: "加载中…",
    approvals: "审批", questions: "问题", usage: "用量", sessions: "会话",
    allow: "允许", reject: "拒绝", answer: "回答", noApprovals: "暂无待审批",
    noQuestions: "暂无待回答问题", newSession: "＋ 新建", refresh: "刷新", cancel: "中断",
    model: "模型", close: "关闭", send: "发送", promptPh: "输入提示词，Enter 发送",
    untitled: "（未命名）", running: "运行中", noUsage: "—",
    denyTool: "拒绝", sessionDetail: "会话",
  },
  "en-US": {
    gate: "Access token", gateHint: "Get or regenerate it in DeepWharf Settings → Remote control.",
    connect: "Connect", badToken: "Invalid token or the service is off", loading: "Loading…",
    approvals: "Approvals", questions: "Questions", usage: "Usage", sessions: "Sessions",
    allow: "Allow", reject: "Reject", answer: "Answer", noApprovals: "Nothing pending",
    noQuestions: "No pending questions", newSession: "＋ New", refresh: "Refresh", cancel: "Interrupt",
    model: "Model", close: "Close", send: "Send", promptPh: "Type a prompt, Enter to send",
    untitled: "(untitled)", running: "running", noUsage: "—",
    denyTool: "Reject", sessionDetail: "Session",
  },
};
const S = I18N[document.documentElement.lang?.startsWith("zh") ? "zh-CN" : "en-US"] || I18N["en-US"];

let token = "";
let current = null; // selected session id
let models = [];

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { ...(opts.body ? { "content-type": "application/json" } : {}), authorization: `Bearer ${token}` },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) throw new Error("unauthorized");
  if (res.status === 404) throw new Error("not found");
  const data = await res.json().catch(() => ({}));
  if (data.ok === false) throw new Error(data.error || "request failed");
  return data.value ?? data;
}

// --- gate --------------------------------------------------------------------

function gate() {
  $("gate").hidden = false;
  $("dash").hidden = true;
}
function enter() {
  $("gate").hidden = true;
  $("dash").hidden = false;
  loadAll();
  openStream();
}
$("gateBtn").addEventListener("click", async () => {
  token = $("token").value.trim();
  $("gateErr").hidden = true;
  try {
    await api("/api/status");
    try {
      localStorage.setItem("dw.remoteToken", token);
    } catch { /* ignore */ }
    enter();
  } catch {
    $("gateErr").textContent = S.badToken;
    $("gateErr").hidden = false;
  }
});
$("token").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("gateBtn").click();
});

// --- sessions -----------------------------------------------------------------

async function loadSessions() {
  const list = await api("/api/sessions");
  const box = $("sessions");
  box.textContent = "";
  if (!list.length) {
    box.innerHTML = `<div class="empty">${esc(S.noApprovals)}</div>`;
    return;
  }
  for (const s of list) {
    const item = document.createElement("div");
    item.className = "item" + (current === s.sessionId ? " active" : "");
    item.style.outline = current === s.sessionId ? "1px solid var(--accent)" : "";
    item.innerHTML = `<div class="t">${s.running ? "● " : ""}${esc(s.title || S.untitled)}</div>
      <div class="m">${s.running ? esc(S.running) + " · " : ""}${esc(s.cwd || "")}</div>`;
    item.addEventListener("click", () => openDetail(s.sessionId));
    box.append(item);
  }
}
$("newSession").addEventListener("click", async () => {
  try {
    const r = await api("/api/sessions", { method: "POST", body: {} });
    if (r && r.sessionId) openDetail(r.sessionId);
  } catch (err) { console.error(err); }
});
$("refreshSessions").addEventListener("click", loadSessions);

// --- detail -------------------------------------------------------------------

async function openDetail(id) {
  current = id;
  $("detailCard").hidden = false;
  $("detailTitle").textContent = S.sessionDetail;
  await loadDetail();
}
async function loadDetail() {
  if (!current) return;
  try {
    const [hist, m] = await Promise.all([
      api(`/api/sessions/${encodeURIComponent(current)}/history?max=60`),
      api(`/api/sessions/${encodeURIComponent(current)}/models`).catch(() => null),
    ]);
    models = m?.groups?.flatMap((g) => g.models.map((mm) => ({ id: mm.id, provider: g.id, name: mm.name }))) ?? [];
    const box = $("history");
    box.textContent = "";
    const events = hist?.events ?? [];
    if (!events.length) {
      box.innerHTML = `<div class="empty">${esc(S.loading)}</div>`;
      return;
    }
    for (const { event } of events.slice(-60)) {
      const kind = String(event.type || "").replace(/^session\//, "");
      const data = event.data;
      const text = extractText(data);
      if (!text) continue;
      const div = document.createElement("div");
      div.className = "msg" + (kind === "user" || kind === "prompt" ? " user" : "");
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = kind;
      div.append(meta);
      const pre = document.createElement("div");
      pre.textContent = text.slice(0, 4000);
      div.append(pre);
      box.append(div);
    }
    box.scrollTop = box.scrollHeight;
  } catch (err) { console.error(err); }
}
function extractText(data) {
  if (!data || typeof data !== "object") return "";
  if (typeof data.text === "string") return data.text;
  if (Array.isArray(data.content)) {
    return data.content.map((c) => (c && typeof c.text === "string" ? c.text : "")).join("\n");
  }
  if (typeof data.summary === "string") return data.summary;
  return "";
}
$("promptForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("prompt").value.trim();
  if (!text || !current) return;
  $("prompt").value = "";
  try {
    await api(`/api/sessions/${encodeURIComponent(current)}/prompt`, { method: "POST", body: { text } });
    setTimeout(loadDetail, 800);
  } catch (err) { console.error(err); }
});
$("btnCancel").addEventListener("click", async () => {
  if (!current) return;
  try {
    await api(`/api/sessions/${encodeURIComponent(current)}/cancel`, { method: "POST", body: {} });
  } catch (err) { console.error(err); }
});
$("btnModel").addEventListener("click", async () => {
  if (!current || !models.length) return;
  const names = models.map((m) => `${m.provider}/${m.id}`).join("\n");
  const pick = prompt(`可用模型：\n${names}\n\n输入 provider/model`, models[0] ? `${models[0].provider}/${models[0].id}` : "");
  if (!pick) return;
  const [provider, model] = pick.split("/").map((x) => x.trim());
  if (!provider || !model) return;
  try {
    await api(`/api/sessions/${encodeURIComponent(current)}/model`, { method: "POST", body: { provider, model } });
  } catch (err) { console.error(err); }
});
$("btnCloseDetail").addEventListener("click", () => {
  current = null;
  $("detailCard").hidden = true;
});

// --- approvals + questions -----------------------------------------------------

async function loadApprovals() {
  const list = await api("/api/approvals");
  $("approvalCount").textContent = list.length ? String(list.length) : "";
  const box = $("approvals");
  box.textContent = "";
  if (!list.length) {
    box.innerHTML = `<div class="empty">${esc(S.noApprovals)}</div>`;
    return;
  }
  for (const a of list) {
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `<div class="t">${esc(a.toolName || "tool")}</div>
      <div class="m">${esc(a.reason || a.callId || a.sessionId || "")}</div>
      <div class="actions">
        <button class="primary" data-allow="${esc(a.approvalId)}">${esc(S.allow)}</button>
        <button data-reject="${esc(a.approvalId)}">${esc(S.reject)}</button>
      </div>`;
    box.append(item);
  }
}
async function loadQuestions() {
  const list = await api("/api/questions");
  $("questionCount").textContent = list.length ? String(list.length) : "";
  const box = $("questions");
  box.textContent = "";
  if (!list.length) {
    box.innerHTML = `<div class="empty">${esc(S.noQuestions)}</div>`;
    return;
  }
  for (const q of list) {
    const item = document.createElement("div");
    item.className = "item";
    const prompt = (q.questions || []).map((x) => x.prompt || x.id).join(" / ") || "?";
    item.innerHTML = `<div class="t">${esc(prompt)}</div>
      <div class="rowline tight" style="margin-top:8px">
        <input type="text" placeholder="回答…" data-qkey="${esc(q.key)}">
        <button class="primary" data-answer="${esc(q.key)}">${esc(S.answer)}</button>
        <button data-qcancel="${esc(q.key)}">${esc(S.denyTool)}</button>
      </div>`;
    box.append(item);
  }
}
$("approvals").addEventListener("click", async (e) => {
  const allow = e.target.closest("[data-allow]");
  const reject = e.target.closest("[data-reject]");
  if (!allow && !reject) return;
  const id = (allow || reject).dataset.allow || (allow || reject).dataset.reject;
  try {
    await api(`/api/approvals/${encodeURIComponent(id)}`, {
      method: "POST",
      body: { outcome: allow ? "allowed-once" : "rejected" },
    });
    loadApprovals();
  } catch (err) { console.error(err); }
});
$("questions").addEventListener("click", async (e) => {
  const answer = e.target.closest("[data-answer]");
  const cancel = e.target.closest("[data-qcancel]");
  if (answer) {
    const key = answer.dataset.answer;
    const input = document.querySelector(`[data-qkey="${CSS.escape(key)}"]`);
    try {
      await api(`/api/questions/${encodeURIComponent(key)}`, { method: "POST", body: { text: input?.value || "" } });
      loadQuestions();
    } catch (err) { console.error(err); }
    return;
  }
  if (cancel) {
    try {
      await api(`/api/questions/${encodeURIComponent(cancel.dataset.qcancel)}`, { method: "POST", body: { text: "__reject__" } });
      loadQuestions();
    } catch (err) { console.error(err); }
  }
});

// --- usage ---------------------------------------------------------------------

async function loadUsage() {
  try {
    const u = await api("/api/usage");
    const latest = (u.sessions || []).filter((x) => x.usage).sort((a, b) => 0)[0];
    const box = $("usage");
    box.textContent = "";
    const total = (u.sessions || []).length;
    const running = (u.sessions || []).filter((x) => x.running).length;
    box.innerHTML = `
      <div>会话 <b>${total}</b> · 运行中 <b>${running}</b></div>
      ${latest ? `<div>最新用量 <b>${esc(u.summary || "")}</b></div>` : `<div>${esc(S.noUsage)}</div>`}`;
  } catch { /* ignore */ }
}

// --- SSE stream -----------------------------------------------------------------

let streamRetry = 0;
function openStream() {
  const es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
  es.onopen = () => {
    $("status").className = "dot on";
    streamRetry = 0;
  };
  es.onerror = () => {
    $("status").className = "dot off";
    es.close();
    setTimeout(openStream, Math.min(5000, 1000 * 2 ** streamRetry++));
  };
  es.onmessage = (ev) => {
    let d;
    try {
      d = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (d.type === "approval" || d.type === "approval-resolved") loadApprovals();
    else if (d.type === "question" || d.type === "question-resolved") loadQuestions();
    else if (d.type === "host/session-status" || d.type === "session/projection") {
      loadSessions();
      loadUsage();
    }
  };
}

async function loadAll() {
  await Promise.allSettled([loadSessions(), loadApprovals(), loadQuestions(), loadUsage()]);
}

// --- boot ----------------------------------------------------------------------

$("gateBtn").textContent = S.connect;
try {
  token = localStorage.getItem("dw.remoteToken") || "";
  $("token").value = token;
} catch { /* ignore */ }
if (token) {
  api("/api/status")
    .then(enter)
    .catch(gate);
} else {
  gate();
}
