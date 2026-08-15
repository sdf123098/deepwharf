# DeepWharf

**[English](./README.md) | 中文**

> [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）的桌面之家。
> 双击安装包，即可把完整的 Harness Agent 体验当作原生 Windows 应用使用——
> 无需 Node.js、无需 npm、无需打开终端。

DeepWharf 是一个轻量的、对上游友好的 Electron 封装。它**不 fork、不修改** DeepSeek Harness，
而是内置独立的 Node.js 运行时 + 一份 vendor 的 `dsh`，启动 `dsh web`、等待本地服务就绪，
再在原生窗口中呈现官方 Web UI。

```
DeepWharf (Electron)
  └─ spawn 内置 node.exe
       └─ dsh web --port <自动>
            └─ BrowserWindow (webview) → http://127.0.0.1:<port>
```

## 特性

- **零依赖安装**——内置 Node 运行时 + vendor 的 Harness，可离线启动。
- **原生桌面外壳**——单行合并标题栏（logo + 插件商店 + 设置），跟随系统明暗主题，
  本地化（简体中文 / English）。
- **插件商店**——浏览 `dsh-plugin` 生态（npm registry），走官方 `dsh plugin` 机制安装（内置 pnpm）。
- **外壳设置**——语言、主题、自动更新开关、版本信息、日志。
- **Harness 自动更新**——查询 registry，原子替换 `resources/harness` 后重启。
- **干净的生命周期**——单实例、端口自动分配、HTTP 就绪探测、退出时清理进程树。
- **安全**——`contextIsolation` + sandbox；用户数据存于 `%APPDATA%`，不写安装目录。

## 下载 / 安装

从 Releases 获取 `DeepWharf-Setup-<ver>-x64.exe`（NSIS）或 `DeepWharf-Portable-<ver>-x64.exe`。
一键、按用户安装；覆盖安装保留数据。

## 从源码构建

仅构建机需要 Node.js ≥ 22。

```bash
npm install
npm run prepare:node       # 下载内置 node.exe + npm + pnpm -> resources/runtime
npm run prepare:harness    # vendor @deepseek-ai/dsh + 裁剪 -> resources/harness
npm run icon               # 用 DeepSeek 官方标志生成 build/icon.ico
npm run dist               # 打包 NSIS + Portable -> release/
```

## 说明

- 安装速度：Harness 已裁剪（去掉源码/source-map/文档），NSIS 使用 `compression: store` 加快解压。
- 代码签名：可插拔钩子 `scripts/sign.js`（`DEEPMHARF_SIGN_MODE=test|pfx|sigpath|none`）。发布产物由 GitHub Actions CI 构建，经 SignPath Foundation 签名（Free code signing provided by [SignPath.io](https://signpath.io)，certificate by [SignPath Foundation](https://signpath.org)）；详见 [CODE_SIGNING.md](./CODE_SIGNING.md)。
- 外壳自更新：默认检查 GitHub Releases（`https://api.github.com/repos/sdf123098/deepwharf/releases/latest`，可用 `SHELL_UPDATE_REPO` 换仓库，或 `SHELL_UPDATE_URL` 指向自定义 `{ "version": "x.y.z" }` JSON）。

## 许可证

MIT —— DeepWharf 为独立封装；DeepSeek Harness 仍按其自身许可证发布。
