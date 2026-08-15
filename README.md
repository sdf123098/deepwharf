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
- **Shell Settings** — language, theme, auto-update toggles, version info, logs.
- **Harness auto-update** — checks the registry and swaps `resources/harness` atomically.
- **Clean lifecycle** — single instance, port auto-pick, HTTP ready-probe, process-tree cleanup on exit.
- **Safe** — `contextIsolation` + sandbox; user data lives in `%APPDATA%`, never in the install dir.

## Download / Install

Grab `DeepWharf-Setup-<ver>-x64.exe` (NSIS) or `DeepWharf-Portable-<ver>-x64.exe` from Releases.
One-click, per-user install; overwrites preserve your data.

## Build from source

Requires Node.js ≥ 22 on the build machine only.

```bash
npm install
npm run prepare:node       # download embedded node.exe + npm + pnpm -> resources/runtime
npm run prepare:harness    # vendor @deepseek-ai/dsh + prune -> resources/harness
npm run icon               # generate build/icon.ico from the official DeepSeek mark
npm run dist               # build NSIS + Portable installers -> release/
```

## Notes

- Install speed: the Harness payload is pruned (sources/maps/docs stripped) and the NSIS package
  uses `compression: store` for fast on-disk extraction.
- Code signing: pluggable hook `scripts/sign.js` (`DEEPMHARF_SIGN_MODE=test|pfx|sigpath|none`).
  Release artifacts are built by GitHub Actions CI and signed via the SignPath Foundation
  (*Free code signing provided by [SignPath.io](https://signpath.io), certificate by
  [SignPath Foundation](https://signpath.org)*). See [CODE_SIGNING.md](./CODE_SIGNING.md).
- Shell self-update feed: set `SHELL_UPDATE_URL` to a JSON `{ "version": "x.y.z" }` to enable checks.

## License

MIT — DeepWharf is an independent wrapper; DeepSeek Harness remains under its own license.
