// API-key onboarding renderer.
"use strict";

const LANG = new URLSearchParams(location.search).get("lang") || "en-US";
const I18N = {
  "zh-CN": {
    title: "配置 API 密钥",
    lead: "检测到以下凭据还未配置。填入密钥后会写入 Harness 的托管凭据存储（立即生效，不改动 settings.yaml / 环境变量）。",
    configured: "已配置",
    skip: "跳过（不再提示）",
    save: "保存",
    saveAll: "保存并完成",
    saved: "已保存，全部凭据配置完成。",
    partial: "已保存。仍有未配置项，可稍后在 Harness 设置中补齐。",
    error: "操作失败：{error}",
    names: { DEEPSEEK_API_KEY: "DeepSeek API 密钥" },
    nameFallback: "凭据 {ref}",
  },
  "en-US": {
    title: "Set up API keys",
    lead: "The credentials below are not configured yet. Values are written to the Harness managed credential store (effective immediately; settings.yaml and env files are untouched).",
    configured: "Configured",
    skip: "Skip (don't ask again)",
    save: "Save",
    saveAll: "Save and finish",
    saved: "Saved — all credentials are configured.",
    partial: "Saved. Some credentials are still missing; you can finish later in Harness settings.",
    error: "Operation failed: {error}",
    names: { DEEPSEEK_API_KEY: "DeepSeek API key" },
    nameFallback: "Credential {ref}",
  },
};
const S = I18N[LANG] || I18N["en-US"];

const $ = (id) => document.getElementById(id);
document.title = S.title;
$("title").textContent = S.title;
$("lead").textContent = S.lead;
$("skip").textContent = S.skip;

function displayName(ref) {
  return S.names[ref] || S.nameFallback.replace("{ref}", ref);
}

async function render(status) {
  const box = $("creds");
  box.textContent = "";
  if (!status.ok) {
    $("msg").className = "msg err";
    $("msg").textContent = S.error.replace("{error}", status.error || "?");
    $("save").disabled = true;
    return;
  }
  const missing = status.items.filter((c) => !c.configured);
  const done = status.items.filter((c) => c.configured);
  for (const c of missing) {
    const div = document.createElement("div");
    div.className = "cred";
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = displayName(c.ref);
    const ref = document.createElement("div");
    ref.className = "ref";
    ref.textContent = c.ref;
    const input = document.createElement("input");
    input.type = "password";
    input.dataset.ref = c.ref;
    input.autocomplete = "off";
    input.placeholder = c.ref;
    div.append(name, ref, input);
    box.append(div);
  }
  for (const c of done) {
    const div = document.createElement("div");
    div.className = "cred";
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = displayName(c.ref);
    const ok = document.createElement("div");
    ok.className = "ok";
    ok.textContent = "✓ " + S.configured + (c.source ? ` (${c.source})` : "");
    div.append(name, ok);
    box.append(div);
  }
  const hasMissing = missing.length > 0;
  $("save").textContent = hasMissing ? S.save : S.saveAll;
  $("save").disabled = !hasMissing;
  $("save").style.display = hasMissing || done.length ? "" : "none";
  $("skip").style.display = hasMissing ? "" : "none";
  return status;
}

$("save").addEventListener("click", async () => {
  const values = {};
  for (const input of document.querySelectorAll("input[data-ref]")) {
    if (input.value.trim() !== "") values[input.dataset.ref] = input.value;
  }
  $("save").disabled = true;
  const status = await window.onboardingApi.save(values);
  await render(status);
  if (status.ok && status.items.length > 0 && status.items.every((c) => c.configured)) {
    $("msg").className = "msg ok";
    $("msg").textContent = S.saved;
  } else if (status.ok) {
    $("msg").className = "msg";
    $("msg").textContent = S.partial;
  }
});

$("skip").addEventListener("click", async () => {
  await window.onboardingApi.skip();
  window.close();
});

window.onboardingApi.status().then(render);
