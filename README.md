<p align="center">
  <img src="resources/brand-logo.png" width="120" alt="DeepWharf logo">
</p>

<h1 align="center">DeepWharf</h1>

<p align="center">
  <strong><a href="./README.zh-CN.md">中文</a> | English</strong>
</p>

<p align="center">
  <img src="resources/pet/pet.png" width="250" alt="Whale-girl desktop companion">
</p>

<p align="center">
  <em>DeepWharf ships with a whale-girl who lives on your desktop — and keeps an eye on your token usage.</em>
</p>

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

## Meet the whale-girl 🐋

The app icon is a little whale on a deep-blue disc, and the desktop pet is her personified form —
a beret-wearing maid whale-girl surrounded by her baby-whale friends.

- **Always-on-top, transparent** — she floats at the corner of your main window and stays on top of everything.
- **Alive** — idle floating, leans in when you hover, bounces with a speech bubble when you click.
- **Interactive** — double-click opens the main window; right-click for a menu; drag her anywhere (position is remembered).
- **Holds a live usage sign** — an optional placard showing input / output / cache-hit % / context % from the official token-meter projections.
- **Reacts to your work** — jumps for joy when a task finishes, shakes when the agent errors.
- **Make her yours** — regenerate the cutout from any artwork with `npm run pet <png>` (flood-fill + halo erosion + largest connected component).

## Features

- **Zero-dependency install** — bundled Node.js runtime + vendored Harness; works offline.
- **Native desktop shell** — single merged title bar (logo + Plugin Store + Settings), themable
  (follows system light/dark), localized (简体中文 / English).
- **Codex-style main window** — a full-height session sidebar that fully replaces the web
  UI's own sidebar (hidden via an `!important` stylesheet rule): workspace-first session
  management (create/rename/delete workspaces, rename/duplicate/archive conversations),
  click-to-switch, icon+text actions, and a collapsed-rail expand handle (Ctrl+Shift+S).
  New workspaces are picked through the native folder dialog — no typing paths.
- **Remote control (LAN)** — an opt-in, token-authenticated web console: view/create
  sessions, send prompts, interrupt runs, switch models, approve tool calls, answer
  questions, and stream live events from any device on your network.
- **Theme sync to the web UI** — shell themes drive the embedded Harness UI through the
  official `ui-theme` settings RPC; the bundled `deepwharf-companion` plugin registers the
  extra palettes (Midnight / Forest / Warm / Contrast) inside the web UI and bridges every
  theme plugin's themes into the shell picker — change the theme on either side and both follow.
- **Usage, in text** — the companion adds a live usage line above the composer
  (input / output / cache hit / context occupancy) from the official token-meter projections.
- **Global font** — pick from presets (default HarmonyOS Sans SC) or keep a custom family;
  the shell and the embedded web UI follow.
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
- **Shell Settings** — language, theme, font, auto-update toggles, version info, logs.
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
