// Live log viewer renderer.
"use strict";

const LANG = new URLSearchParams(location.search).get("lang") || "en-US";
const I18N = {
  "zh-CN": {
    auto: "自动滚动", clear: "清屏", open: "打开目录",
    rotated: "日志已轮转，以上内容来自新文件。",
  },
  "en-US": {
    auto: "Auto-scroll", clear: "Clear", open: "Open folder",
    rotated: "Log rotated — content above is from the new file.",
  },
};
const S = I18N[LANG] || I18N["en-US"];

const $ = (id) => document.getElementById(id);
$("lblAuto").textContent = S.auto;
$("clear").textContent = S.clear;
$("open").textContent = S.open;

// Keep the last ~1MB of text per channel so a long session can't balloon the DOM.
const MAX_CHARS = 1_000_000;
const buffers = new Map([["desktop", ""], ["harness", ""]]);
let active = "desktop";

function render() {
  const out = $("out");
  const text = buffers.get(active) ?? "";
  const stick = $("autoscroll").checked &&
    out.scrollHeight - out.scrollTop - out.clientHeight < 40;
  if (stick) {
    out.textContent = text;
    out.scrollTop = out.scrollHeight;
  } else {
    const scroll = out.scrollTop;
    out.textContent = text;
    out.scrollTop = scroll;
  }
}

window.logApi.onChunk((chunk) => {
  if (!buffers.has(chunk.which)) return;
  let text = buffers.get(chunk.which);
  if (chunk.rotated) {
    text = chunk.text;
    if (chunk.which === active) {
      $("rotated").style.display = "block";
      setTimeout(() => ($("rotated").style.display = "none"), 5000);
    }
  } else {
    text += chunk.text;
  }
  if (text.length > MAX_CHARS) text = text.slice(-MAX_CHARS);
  buffers.set(chunk.which, text);
  if (chunk.which === active) render();
});

function setTab(which) {
  active = which;
  $("tabDesktop").classList.toggle("active", which === "desktop");
  $("tabHarness").classList.toggle("active", which === "harness");
  render();
}
$("tabDesktop").addEventListener("click", () => setTab("desktop"));
$("tabHarness").addEventListener("click", () => setTab("harness"));

$("clear").addEventListener("click", () => {
  buffers.set(active, "");
  render();
});
$("open").addEventListener("click", () => window.logApi.openLogs());
