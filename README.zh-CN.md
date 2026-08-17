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
- **主题联动 Web UI**——外壳主题直接驱动内嵌 Harness Web UI：浅 / 深 / 跟随系统走官方
  `ui-theme` 设置 RPC；内置的 deepwharf-companion 伴生插件把深海蓝 / 森林绿 / 暖沙 / 高对比
  注册进 Web UI，并把**主题插件注册的第三方主题**桥接进外壳主题下拉——任何一侧改主题，
  两侧一起变。
- **用量文字化**——伴生插件在输入框上方常驻一行用量文字（输入 / 输出 / 缓存命中 /
  上下文占用），来自官方 token-meter 投影，实时刷新。
- **Codex 风格主窗口**——左侧全高会话侧边栏**完全取代 Web UI 自带侧边栏**（注入
  !important 样式规则隐藏）：工作区优先的会话管理（工作区建/删/重命名、会话重命名/
  复制/归档、组头 ＋ 新建会话）、点击切换、底部图标+文字操作、折叠把手 + Ctrl+Shift+S。
- **远程控制（局域网）**——可选的令牌鉴权 Web 控制台：手机/其他设备浏览器可查看/新建
  会话、发送提示词、中断任务、切换模型、审批工具调用、回答问题，并实时推送事件。
- **桌宠**——透明置顶的吉祥物桌宠：可拖拽、单击互动、双击唤起主窗口、任务完成跳起来
  庆祝；可**举牌显示用量统计**（可选开关）；`npm run pet <png>` 可从任意素材重新生成抠图。
- **插件商店**——浏览 `dsh-plugin` 生态（npm registry），走官方 `dsh plugin` 机制安装（内置 pnpm）。
- **桌面集成**——关闭窗口最小化到系统托盘（Harness 会话保持运行）、全局快捷键 `Ctrl+Alt+D`
  唤起窗口、可选开机自启，均可在设置中开关。
- **桌面通知与引导**——审批 / 提问 / 任务完成 / 出错时系统 Toast；首次启动检测缺失的
  API 密钥并引导填写（官方凭据存储，立即生效）。
- **会话历史**——独立窗口浏览全部会话、全文搜索、一键导出 ZIP（含子代理与附件）。
- **外壳设置**——语言、主题、自动更新开关、版本信息、日志。
- **Harness 自动更新**——查询 registry，原子替换 `resources/harness` 后重启。
- **干净的生命周期**——单实例、端口自动分配、HTTP 就绪探测、退出时清理进程树。
- **安全**——`contextIsolation` + sandbox；用户数据存于 `%APPDATA%`，不写安装目录。

## 下载 / 安装

从 Releases 获取 `DeepWharf-Setup-<ver>-x64.exe`（NSIS）或 `DeepWharf-Portable-<ver>-x64.exe`。
安装向导默认按用户安装（无需管理员），可自选安装目录（仅选受保护目录时请求提权）；覆盖安装保留数据。

## 从源码构建

仅构建机需要 Node.js ≥ 22。

```bash
npm install
npm run prepare:node       # 下载内置 node.exe + npm + pnpm -> resources/runtime
npm run prepare:harness    # vendor @deepseek-ai/dsh + 裁剪 -> resources/harness
npm run icon               # 由 build/brand-icon.png 重新生成 build/icon.ico
npm run dist               # 打包 NSIS + Portable -> release/
```

品牌图源是 `build/brand-icon.png`（带透明底的方形 PNG）。换图标：
`npm run icon 路径/新图.png` —— 脚本会把它存为品牌源，重新生成 Windows 图标（白色圆角
底板，深浅色任务栏都清晰）与壳内 logo，后续构建自动复用。

## 说明

- 安装速度：Harness 已裁剪（去掉源码/source-map/文档），NSIS 使用 `compression: store` 加快解压。
- 代码签名：可插拔钩子 `scripts/sign.js`（`DEEPMHARF_SIGN_MODE=test|pfx|sigpath|none`）。发布产物由 GitHub Actions CI 构建，经 SignPath Foundation 签名（Free code signing provided by [SignPath.io](https://signpath.io)，certificate by [SignPath Foundation](https://signpath.org)）；详见 [CODE_SIGNING.md](./CODE_SIGNING.md)。
- 外壳自更新：默认检查 GitHub Releases（`https://api.github.com/repos/sdf123098/deepwharf/releases/latest`，可用 `SHELL_UPDATE_REPO` 换仓库，或 `SHELL_UPDATE_URL` 指向自定义 `{ "version": "x.y.z" }` JSON）。

## 许可证

MIT —— DeepWharf 为独立封装；DeepSeek Harness 仍按其自身许可证发布。
