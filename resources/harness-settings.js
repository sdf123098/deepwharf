// Harness advanced-settings renderer.
"use strict";

const LANG = new URLSearchParams(location.search).get("lang") || "en-US";
const I18N = {
  "zh-CN": {
    title: "Harness 设置", secModel: "模型请求", secAdvanced: "高级",
    lblProvider: "提供方", official: "官方",
    lblRetry: "请求失败重试",
    retryHarnessDefault: "Harness 默认", retryRecommended: "推荐",
    retryUnstable: "网络不稳定", retryAlways: "持续重试", retryCustom: "自定义",
    retryDefaultDetail: "不写入固定重试参数，跟随 Harness 内置默认策略。",
    retryRecommendedDetail: "最多重试 6 次\n约：1s → 2s → 4s → 8s → 15s → 15s",
    retryUnstableDetail: "最多重试 8 次\n约：1.5s → 3s → 6s → 12s → 24s → 30s → 30s → 30s\n适合第三方 API、中转站、高峰期 502/503 与跨境网络。",
    retryAlwaysDetail: "请求会持续重试，直到成功、取消请求或 Harness 退出。不建议默认启用。",
    retryCustomDetail: "自定义（由 settings.yaml 设置）。只有切换到某个预设才会覆盖它。",
    lblTimeout: "请求超时",
    subTimeout: "模型请求超过该时长未返回即判定失败。",
    lblStreamIdle: "流式响应空闲超时",
    subStreamIdle: "模型已建立连接但长时间没有新的流式数据时，等待多久后判定请求失效。",
    lblWs: "WebSocket 连接超时",
    subWs: "与提供方的 WebSocket 连接建立超时时间。",
    reset: "恢复默认",
    appliesLive: "修改立即生效。",
    appliesRestart: "修改将在 Harness 重启后生效。",
    apply: "应用修改",
    lblStatus: "Harness 当前状态",
    statusRunning: "运行中", statusReadonly: "只读", statusRestarting: "重启中…", statusStopped: "已停止",
    restart: "重启 Harness",
    confirmRestart: "确定重启 Harness？正在进行的会话可能中断。",
    restartFailed: "重启失败",
    conflictReload: "Harness 配置已在其他位置发生变化。\n\n重新加载以显示最新配置？",
    applyFailed: "应用修改失败",
    errorText: "无法读取 Harness 设置。请确认 Harness 正在运行。",
    retry: "重试",
    noProviders: "未找到可配置的 Provider。请先在 Harness 的模型设置中添加 Provider。",
  },
  "en-US": {
    title: "Harness Settings", secModel: "Model Requests", secAdvanced: "Advanced",
    lblProvider: "Provider", official: "Official",
    lblRetry: "Retry on request failure",
    retryHarnessDefault: "Harness default", retryRecommended: "Recommended",
    retryUnstable: "Unstable network", retryAlways: "Retry forever", retryCustom: "Custom",
    retryDefaultDetail: "Writes no fixed retry parameters; follows the Harness built-in defaults.",
    retryRecommendedDetail: "Up to 6 retries\n≈ 1s → 2s → 4s → 8s → 15s → 15s",
    retryUnstableDetail: "Up to 8 retries\n≈ 1.5s → 3s → 6s → 12s → 24s → 30s → 30s → 30s\nGood for third-party APIs, gateways, peak-hour 502/503 and cross-border networks.",
    retryAlwaysDetail: "Requests keep retrying until they succeed, are cancelled, or the Harness exits. Not recommended as the default.",
    retryCustomDetail: "Custom (set in settings.yaml). It is only overwritten when you switch to a preset.",
    lblTimeout: "Request timeout",
    subTimeout: "Fails the request when the model takes longer than this to respond.",
    lblStreamIdle: "Stream idle timeout",
    subStreamIdle: "How long to wait after the connection is established before a stream with no new data is considered failed.",
    lblWs: "WebSocket connect timeout",
    subWs: "Timeout for establishing the WebSocket connection to the provider.",
    reset: "Reset to default",
    appliesLive: "Changes apply immediately.",
    appliesRestart: "Changes take effect after the Harness restarts.",
    apply: "Apply changes",
    lblStatus: "Harness status",
    statusRunning: "Running", statusReadonly: "Read-only", statusRestarting: "Restarting…", statusStopped: "Stopped",
    restart: "Restart Harness",
    confirmRestart: "Restart the Harness? In-flight sessions may be interrupted.",
    restartFailed: "Restart failed",
    conflictReload: "The Harness configuration changed elsewhere.\n\nReload to show the latest configuration?",
    applyFailed: "Failed to apply changes",
    errorText: "Cannot read Harness settings. Make sure the Harness is running.",
    retry: "Retry",
    noProviders: "No configurable providers found. Add a provider in the Harness model settings first.",
  },
};
const S = I18N[LANG] || I18N["en-US"];

const $ = (id) => document.getElementById(id);

const RETRY_DETAIL = {
  "harness-default": S.retryDefaultDetail,
  recommended: S.retryRecommendedDetail,
  unstable: S.retryUnstableDetail,
  always: S.retryAlwaysDetail,
  custom: S.retryCustomDetail,
};
const RETRY_OPTIONS = ["harness-default", "recommended", "unstable", "always", "custom"];
const RETRY_LABELS = {
  "harness-default": S.retryHarnessDefault,
  recommended: S.retryRecommended,
  unstable: S.retryUnstable,
  always: S.retryAlways,
  custom: S.retryCustom,
};

let view = null; // HarnessSettingsView
let current = null; // ProviderView
let dirty = false;

function setDirty(d) {
  dirty = d;
  $("apply").disabled = !d;
}

function secsToInput(ms) {
  return ms && ms > 0 ? String(Math.round(ms / 1000)) : "";
}

/** "" / 0 / garbage -> null (remove override); otherwise a positive whole-second count. */
function readSecs(input) {
  const v = input.value.trim();
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function loadedSecs(ms) {
  return ms && ms > 0 ? Math.round(ms / 1000) : null;
}

function selectProvider(id) {
  const p = view.providers.find((x) => x.id === id) ?? view.providers[0];
  if (!p) {
    current = null;
    setDirty(false);
    $("retryDetail").textContent = S.noProviders;
    $("retryDetail").className = "hint";
    return;
  }
  current = p;
  $("provider").value = p.id;
  $("retry").value = p.retryChoice;
  $("retryDetail").textContent = RETRY_DETAIL[p.retryChoice];
  $("retryDetail").className = "hint" + (p.retryChoice === "always" ? " warn" : "");
  $("rowTimeoutMs").hidden = !p.capabilities.timeoutMs;
  $("timeoutMs").value = secsToInput(p.timeoutMs);
  $("rowStreamIdle").hidden = !p.capabilities.streamIdleTimeoutMs;
  $("streamIdle").value = secsToInput(p.streamIdleTimeoutMs);
  $("rowWs").hidden = !p.capabilities.websocketConnectTimeoutMs;
  $("ws").value = secsToInput(p.websocketConnectTimeoutMs);
  $("appliesHint").textContent = p.applies === "restart" ? S.appliesRestart : S.appliesLive;
  setDirty(false);
}

function render() {
  const sel = $("provider");
  sel.innerHTML = "";
  for (const p of view.providers) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.kind === "deepseek" ? `${p.displayName}（${S.official}）` : p.displayName;
    sel.appendChild(opt);
  }
  $("status").textContent = view.writable ? S.statusRunning : S.statusReadonly;
  selectProvider(sel.value);
}

function showError() {
  $("content").hidden = true;
  $("errorState").hidden = false;
}

async function load() {
  const res = await window.harnessSettingsApi.get();
  if (!res.ok) {
    showError();
    return;
  }
  view = res.view;
  $("errorState").hidden = true;
  $("content").hidden = false;
  render();
}

// --- wiring ---------------------------------------------------------------

document.title = S.title;
$("title").textContent = S.title;
$("secModel").textContent = S.secModel;
$("secAdvanced").textContent = S.secAdvanced;
$("lblProvider").textContent = S.lblProvider;
$("lblRetry").textContent = S.lblRetry;
$("lblTimeout").textContent = S.lblTimeout;
$("subTimeout").textContent = S.subTimeout;
$("lblStreamIdle").textContent = S.lblStreamIdle;
$("subStreamIdle").textContent = S.subStreamIdle;
$("lblWs").textContent = S.lblWs;
$("subWs").textContent = S.subWs;
$("lblStatus").textContent = S.lblStatus;
$("apply").textContent = S.apply;
$("restart").textContent = S.restart;
$("retryLoad").textContent = S.retry;
$("errorText").textContent = S.errorText;
$("resetTimeoutMs").textContent = S.reset;
$("resetStreamIdle").textContent = S.reset;
$("resetWs").textContent = S.reset;
RETRY_OPTIONS.forEach((v, i) => {
  $("retry").options[i].textContent = RETRY_LABELS[v];
});

$("provider").addEventListener("change", () => selectProvider($("provider").value));

$("retry").addEventListener("change", () => {
  const c = $("retry").value;
  $("retryDetail").textContent = RETRY_DETAIL[c];
  $("retryDetail").className = "hint" + (c === "always" ? " warn" : "");
  setDirty(true);
});

["timeoutMs", "streamIdle", "ws"].forEach((id) => {
  $(id).addEventListener("input", () => setDirty(true));
  $(id).addEventListener("change", () => setDirty(true));
});
$("resetTimeoutMs").addEventListener("click", () => { $("timeoutMs").value = ""; setDirty(true); });
$("resetStreamIdle").addEventListener("click", () => { $("streamIdle").value = ""; setDirty(true); });
$("resetWs").addEventListener("click", () => { $("ws").value = ""; setDirty(true); });

$("apply").addEventListener("click", async () => {
  if (!current || !dirty) return;
  const edits = {};
  const retry = $("retry").value;
  if (retry !== current.retryChoice) edits.retry = retry;
  const t = readSecs($("timeoutMs"));
  if (t !== loadedSecs(current.timeoutMs)) edits.timeoutMsSec = t;
  const si = readSecs($("streamIdle"));
  if (si !== loadedSecs(current.streamIdleTimeoutMs)) edits.streamIdleTimeoutMsSec = si;
  const w = readSecs($("ws"));
  if (w !== loadedSecs(current.websocketConnectTimeoutMs)) edits.websocketConnectTimeoutMsSec = w;

  if (Object.keys(edits).length === 0) {
    setDirty(false);
    return;
  }
  $("apply").disabled = true;
  const res = await window.harnessSettingsApi.apply({
    providerId: current.id,
    ns: current.ns,
    revision: current.revision,
    edits,
  });
  if (res.ok) {
    await load();
    return;
  }
  if (res.conflict) {
    if (confirm(S.conflictReload)) {
      await load();
    } else {
      setDirty(true);
    }
    return;
  }
  alert(`${S.applyFailed}\n${res.error || ""}`);
  setDirty(true);
});

$("restart").addEventListener("click", async () => {
  if (!confirm(S.confirmRestart)) return;
  $("restart").disabled = true;
  $("status").textContent = S.statusRestarting;
  const res = await window.harnessSettingsApi.restart();
  if (!res.ok) {
    alert(`${S.restartFailed}\n${res.error || ""}`);
    $("status").textContent = S.statusRunning;
    $("restart").disabled = false;
    return;
  }
  // The harness comes back on a fresh port; poll until it answers again.
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const r2 = await window.harnessSettingsApi.get();
    if (r2.ok) {
      view = r2.view;
      $("restart").disabled = false;
      render();
      return;
    }
  }
  $("restart").disabled = false;
  showError();
});

$("retryLoad").addEventListener("click", () => load());

load();
