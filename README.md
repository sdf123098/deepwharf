# DeepWharf

**[中文](./README.zh-CN.md) | English**

> A desktop home for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`).
> Double-click an installer and get the full Harness agent experience as a native Windows app —
> no Node.js, no npm, no terminal required.

DeepWharf is a thin, upstream-friendly Electron wrapper. It does **not** fork or modify DeepSeek
Harness; it embeds an isolated Node.js runtime plus a vendored copy of `dsh`, launches `dsh web`,
waits for the local server, and presents the official Web UI in a native window.

```
DeepWharf (Electron)
  └─ spawn embedded node.exe
       └─ dsh web --port <auto>
            └─ BrowserWindow (webview) → http://127.0.0.1:<port>
```

## Features

- **Zero-dependency install** — bundled Node.js runtime + vendored Harness; works offline.
- **Native desktop shell** — single merged title bar (logo + Plugin Store + Settings), themable
  (follows system light/dark), localized (简体中文 / English).
- **Plugin Store** — browse the `dsh-plugin` ecosystem (npm registry) and install via the official
  `dsh plugin` mechanism (bundled pnpm).
- **Desktop integration** — closing the window minimizes to the system tray (Harness sessions keep
  running), a global `Ctrl+Alt+D` hotkey shows the window, and launch-at-startup is optional.
  All three can be toggled in Settings.
- **Notifications & onboarding** — system toasts for approvals, questions, finished tasks, and
  agent errors; first run detects missing API keys and walks you through the official credential
  store (effective immediately).
- **Session history** — a dedicated window to browse all sessions, full-text search them, and
  export any one as a ZIP (with subagent logs and media attachments).
- **Shell Settings** — language, theme, auto-update toggles, version info, logs.
- **Harness auto-update** — checks the registry and swaps `resources/harness` atomically.
- **Clean lifecycle** — single instance, port auto-pick, HTTP ready-probe, process-tree cleanup on exit.
- **Safe** — `contextIsolation` + sandbox; user data lives in `%APPDATA%`, never in the install dir.

## Download / Install

Grab `DeepWharf-Setup-<ver>-x64.exe` (NSIS) or `DeepWharf-Portable-<ver>-x64.exe` from Releases.
The installer wizard defaults to a per-user install (no admin needed) and lets you pick the
install directory (elevation is only requested for protected locations); overwrites preserve
your data.

## Build from source

Requires Node.js ≥ 22 on the build machine only.

```bash
npm install
npm run prepare:node       # download embedded node.exe + npm + pnpm -> resources/runtime
npm run prepare:harness    # vendor @deepseek-ai/dsh + prune -> resources/harness
npm run icon                # regenerate build/icon.ico from build/brand-icon.png
npm run dist               # build NSIS + Portable installers -> release/
```

The brand artwork lives in `build/brand-icon.png` (square PNG with
transparency). To swap it: `npm run icon path/to/new-art.png` — the script
copies the file into `build/`, regenerates the Windows icon (mounted on a white
rounded plate for dark/light taskbar visibility) and the shell logo, and later
rebuilds keep using the committed source.

## Notes

- Install speed: the Harness payload is pruned (sources/maps/docs stripped) and the NSIS package
  uses `compression: store` for fast on-disk extraction.
- Code signing: pluggable hook `scripts/sign.js` (`DEEPMHARF_SIGN_MODE=test|pfx|sigpath|none`).
  Release artifacts are built by GitHub Actions CI and signed via the SignPath Foundation
  (*Free code signing provided by [SignPath.io](https://signpath.io), certificate by
  [SignPath Foundation](https://signpath.org)*). See [CODE_SIGNING.md](./CODE_SIGNING.md).
- Shell self-update feed: checks GitHub Releases by default
  (`https://api.github.com/repos/sdf123098/deepwharf/releases/latest`; override the repo with
  `SHELL_UPDATE_REPO`, or point `SHELL_UPDATE_URL` at a custom `{ "version": "x.y.z" }` JSON).

## License

MIT — DeepWharf is an independent wrapper; DeepSeek Harness remains under its own license.
