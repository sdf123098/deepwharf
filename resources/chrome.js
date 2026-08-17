// Frameless sub-window chrome: a slim draggable header with the window title
// and a close button (minimize only when body[data-chrome-min] is present).
// The header is position:fixed and the body gets a matching top padding, so
// it works regardless of how the page lays out its own content.
// Injects its own styles, so pages only need one <script src="chrome.js">.
// No-op when the window still has a native frame (window.chromeApi absent).
"use strict";

(function () {
  if (typeof window.chromeApi === "undefined" || !window.chromeApi) return;

  const CHROME_H = 34;

  const style = document.createElement("style");
  style.textContent = `
    #win-chrome { position: fixed; top: 0; left: 0; right: 0; height: ${CHROME_H}px;
      display: flex; align-items: center; padding: 0 6px 0 12px; gap: 6px;
      background: var(--panel, #161b22);
      -webkit-app-region: drag; user-select: none; z-index: 2147483000; }
    #win-chrome .wc-title { font-size: 12.5px; font-weight: 600; color: var(--muted, #8b949e);
      margin-right: auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #win-chrome .wc-btn { -webkit-app-region: no-drag; width: 28px; height: 24px; border: none;
      border-radius: 6px; background: transparent; color: var(--muted, #8b949e);
      font-size: 13px; line-height: 1; cursor: pointer; display: grid; place-items: center; }
    #win-chrome .wc-btn:hover { background: var(--border, #21262d); color: var(--text, #e6edf3); }
    #win-chrome .wc-close:hover { background: #e81123; color: #fff; }
  `;
  document.head.appendChild(style);

  const header = document.createElement("div");
  header.id = "win-chrome";

  const title = document.createElement("span");
  title.className = "wc-title";
  const syncTitle = () => {
    title.textContent = document.body.dataset.chromeTitle || document.title || "";
  };
  syncTitle();
  new MutationObserver(syncTitle).observe(document.body, {
    attributes: true,
    attributeFilter: ["data-chrome-title"],
  });
  header.appendChild(title);

  if (document.body.dataset.chromeMin !== undefined) {
    const min = document.createElement("button");
    min.className = "wc-btn";
    min.textContent = "—";
    min.title = "Minimize";
    min.addEventListener("click", () => window.chromeApi.minimize());
    header.appendChild(min);
  }

  const close = document.createElement("button");
  close.className = "wc-btn wc-close";
  close.textContent = "✕";
  close.title = "Close";
  close.addEventListener("click", () => window.chromeApi.close());
  header.appendChild(close);

  document.body.prepend(header);
  document.body.style.margin = "0";
  document.body.style.paddingTop = CHROME_H + "px";
})();
