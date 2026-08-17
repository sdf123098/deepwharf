// Desktop pet renderer: idle life, drag, click reactions, usage sign.
"use strict";

const params = new URLSearchParams(location.search);
const LANG = params.get("lang") || "en-US";
const SIGN_ON = params.get("sign") === "1";

const I18N = {
  "zh-CN": {
    clicks: [
      "今天也要加油哦！",
      "鲸鱼说：上下文还很多，放心冲～",
      "戳我干嘛，快去干活！",
      "缓存命中率不错嘛 👀",
      "我在帮你盯着用量呢。",
      "深水港，永不眠。",
      "要不要 /compact 一下？",
      "我可是会举牌的桌宠！",
    ],
    done: ["任务完成啦！🎉", "搞定！休息一下～", "跑完了，快来看看！"],
    error: ["呜…出错了 😣", "Agent 摔倒了，快看看日志！"],
    signWaiting: "还没有用量…",
  },
  "en-US": {
    clicks: [
      "Let's get to work!",
      "The whale says: plenty of context left~",
      "Hey, stop poking me!",
      "Nice cache hit rate 👀",
      "I'm watching the usage for you.",
      "Deep wharf never sleeps.",
      "Maybe /compact a little?",
      "I'm a pet with a sign!",
    ],
    done: ["Task finished! 🎉", "Done! Take a break~", "It's over — come look!"],
    error: ["Ouch… something errored 😣", "The agent tripped — check the logs!"],
    signWaiting: "no usage yet…",
  },
};
const S = I18N[LANG] || I18N["en-US"];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const pet = document.getElementById("pet");
const sign = document.getElementById("sign");
const signText = document.getElementById("signText");
const bubble = document.getElementById("bubble");

// --- speech bubbles ---------------------------------------------------------

let bubbleTimer = 0;
function say(text) {
  bubble.textContent = text;
  bubble.classList.add("show");
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => bubble.classList.remove("show"), 2600);
}

function react(className) {
  pet.classList.remove("idle", "pop", "jump", "shake");
  // restart the animation from frame 0
  void pet.offsetWidth;
  pet.classList.add(className);
  pet.addEventListener(
    "animationend",
    () => {
      pet.classList.remove("pop", "jump", "shake");
      if (!pet.classList.contains("drag")) pet.classList.add("idle");
    },
    { once: true },
  );
}

// --- drag / click -----------------------------------------------------------

let pressing = false;
let dragging = false;
let lastX = 0;
let lastY = 0;

// Drag uses viewport-relative clientX/Y: the deltas are identical to screen
// deltas while the window follows the cursor, and clientX/Y are reliable on
// every platform (screenX/Y are inconsistent for frameless windows on some
// Windows/DPI setups).
pet.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  pressing = true;
  dragging = false;
  lastX = e.clientX;
  lastY = e.clientY;
  e.preventDefault();
});

window.addEventListener("mousemove", (e) => {
  if (!pressing) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  if (!dragging && Math.hypot(dx, dy) > 4) {
    dragging = true;
    pet.classList.remove("idle", "lean-in");
    pet.classList.add("drag");
  }
  if (dragging) {
    lastX = e.clientX;
    lastY = e.clientY;
    if (dx !== 0 || dy !== 0) {
      try {
        window.petApi.move(dx, dy);
      } catch (err) {
        console.error("pet move failed:", err);
      }
    }
  }
});

window.addEventListener("mouseup", () => {
  if (!pressing) return;
  pressing = false;
  if (dragging) {
    pet.classList.remove("drag");
    pet.classList.add("idle");
  } else {
    react("pop");
    say(pick(S.clicks));
  }
  dragging = false;
});

pet.addEventListener("dblclick", () => {
  try {
    window.petApi.openMain();
  } catch (err) {
    console.error("pet openMain failed:", err);
  }
});
pet.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  try {
    window.petApi.contextMenu();
  } catch (err) {
    console.error("pet context menu failed:", err);
  }
});
pet.addEventListener("mouseenter", () => {
  if (!pressing && !dragging) {
    pet.classList.remove("idle");
    pet.classList.add("lean-in");
  }
});
pet.addEventListener("mouseleave", () => {
  if (!pressing && !dragging) {
    pet.classList.remove("lean-in");
    pet.classList.add("idle");
  }
});

// --- usage sign + events ----------------------------------------------------

function setSignVisible(visible) {
  sign.classList.toggle("hidden", !visible);
}
setSignVisible(SIGN_ON);

window.petApi.onUsage((text) => {
  if (!text) {
    signText.textContent = S.signWaiting;
    signText.className = "empty";
    return;
  }
  signText.className = "";
  // let the numbers pop: split on "·", bold the value tails
  const parts = text.split(" · ");
  signText.textContent = "";
  parts.forEach((part, i) => {
    if (i > 0) signText.append(" · ");
    const m = /^(.*? )([\d.,]+[KMB]?%?(\s*\([^)]*\))?)$/.exec(part);
    if (m) {
      signText.append(m[1]);
      const b = document.createElement("b");
      b.textContent = m[2];
      signText.append(b);
    } else {
      signText.append(part);
    }
  });
});

window.petApi.onPetEvent((kind) => {
  if (kind === "done") {
    react("jump");
    say(pick(S.done));
  } else if (kind === "error") {
    react("shake");
    say(pick(S.error));
  }
});

window.petApi.onSign((visible) => setSignVisible(visible === true));
