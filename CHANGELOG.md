# Changelog

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。所有值得注意的变更都会记录在此文件。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [0.4.0] - 2026-08-16

### 新增 / New

- **安装向导 + 自选路径** — NSIS 安装器从一键安装改为向导式：默认按用户安装（无需管理员），
  可自由选择安装目录（仅选受保护目录时请求提权）
- **系统托盘保活** — 关闭主窗口时最小化到托盘，Harness 进程与会话继续运行；首次隐藏有气泡
  提示；托盘菜单可显示窗口 / 退出；托盘或全局快捷键唤起窗口（可在设置中关闭）
- **全局快捷键** — `Ctrl+Alt+D` 随时唤起窗口（可关闭；被占用时记录日志不崩溃）
- **开机自启** — 设置中可开关（写入注册表 Run 键；仅打包版生效）
- **崩溃对话框可见性** — Harness 崩溃时窗口若隐藏在托盘，先恢复窗口再弹对话框
- **桌面通知** — 主进程直连 Harness 的两个 SSE 事件流（`/api/events.host`、`/api/events.mux`），
  审批等待 / Agent 提问 / 任务完成（会话 running 由真变假）/ Agent 出错时弹系统 Toast（点击唤起窗口）；
  仅在窗口不可见或失焦时打扰；子代理会话的噪音被过滤；可在设置中开关（默认开）
- **API 密钥引导向导** — 首次启动自动检测未配置的凭据：凭据引用名从 settings schema 的
  `credential-ref` 标记发现（非写死），经官方 `credentials.describe/set` 读写托管凭据存储，
  立即生效；可跳过（记住选择，不再自动弹出）
- **会话历史浏览器** — 标题栏新增「会话」窗口：会话列表（标题/运行状态/更新时间/工作目录）、
  全文搜索（官方 `session.search`）、一键导出 ZIP（`session.export`，含子代理与图片附件）
- **全新品牌图标** — 应用图标 / 托盘 / 标题栏 / 启动页统一换用新品牌形象（`build/brand-icon.png`，
  自动居中裁方 + 白色圆角底板，深浅色任务栏均清晰）；`npm run icon <png>` 可随时替换品牌源图
- **`deepwharf://` 协议唤起** — 注册系统协议（按用户，无需管理员），浏览器 / IDE 可唤起窗口；
  `deepwharf://new?prompt=…&cwd=…` 经确认对话框后创建会话并发送提示词（官方 `session.create` +
  `session.prompt`；外部链接永不自动发送，取消为默认按钮）
- **日志实时查看器** — 外壳设置新增「实时查看」：desktop.log / harness.log 双通道 1s 轮询追尾、
  轮转检测、自动滚动；配套「清屏 / 打开目录」
- **丰富主题** — 外壳主题从 3 档扩展到 7 档（跟随系统 / 浅色 / 深色 / 深海蓝 / 森林绿 / 暖沙 /
  高对比），覆盖标题栏与全部壳窗口（设置 / 商店 / 向导 / 会话 / 日志 / 启动页），切换即时生效；
  主题同时驱动系统明暗基调，内嵌 Harness Web UI 跟随
- **插件商店：GitHub 与社区源可直接安装** — GitHub 主题源和 awesome 精选列表的仓库一键安装
  （走官方 `dsh plugin add github:owner/repo`，tarball 经 codeload，已实测）；新增「直接安装」
  输入框，npm 包名 / owner/repo / 任意 pnpm spec 都能装，与原版一致；npm 搜索结果仍保留
  dsh.bundle 校验；已装列表同时识别 bundles 与 dependencies 中的插件
- **用量面板** — 标题栏新增「用量」：缓存命中率环形图、上下文占用条（projectedTokens/contextWindow，
  接近上限自动变色）、token 四桶卡片（命中/未命中/写入/输出）与输入构成堆叠条；数据来自官方
  token-meter 投影，会话选定后随 mux 流实时刷新；会话历史列表同步显示累计 token 与命中率
- **插件管理（独立于商店，三页签）** —
  插件：已装列表（版本/内置/插件层/普通依赖）、官方 `dsh plugin` 更新/卸载，以及基于官方
  cordis.patch.yml `disabled` 覆盖的**停用/启用**（条目映射来自 `--dump-config`，托管块不触碰
  用户与插件的补丁内容，已真机验证逐字节还原）；
  MCP：列出全部 dsh-mcp-client 实例（传输/命令/开关），表单新增 stdio / streamable-http 服务器，
  停用/删除（插件提供的服务器不可删只可停用）；
  技能：官方 `skill.list` 按会话可见性列出，一键打开 DSH_HOME/skills 目录

### 说明 / Notes

- MCP 服务器状态检查经调研不做：dsh 的 MCP 客户端无任何 RPC/设置暴露面（服务器配置在 cordis.yml，
  运行时状态不对外），壳侧无法在不 fork dsh 的前提下获取真实状态

### 改进 / Improvements

- 外壳设置窗口新增三个桌面集成开关；`sanitizeSettingsPatch` 与单元测试同步扩展（24 项全过）
- 托盘图标随安装包内置（ASAR 内 `build/icon.ico`）

### 修复 / Fixes

- **桌面通知不触发的根因修复** — Harness 的事件端点（`/api/events.host` / `events.mux`）对普通 GET
  返回 426，仅接受 WebSocket 升级，原实现的 fetch-SSE 订阅永远失败且静默；改为 WebSocket 客户端
  订阅（帧格式不变），并输出流连接/断开日志（可在「实时查看」中诊断），系统通知不支持时也会记录

## [0.3.0] - 2026-08-15

### 新增 / New

- **Harness 设置窗口** — 补齐原版设置界面未暴露的模型请求高级参数（通过 Harness 自身 `settings.describe` / `settings.mutate` API 读写，不直接编辑 settings.yaml）：
  - 提供方独立的失败重试策略：Harness 默认 / 推荐 / 网络不稳定 / 持续重试；自定义策略只读保护，不会被静默覆盖；恢复默认使用 `unset`，跟随 Harness 升级后的默认策略
  - 请求超时、流式响应空闲超时、WebSocket 连接超时（按 Provider schema 自动显隐；官方 DeepSeek 自动隐藏不支持的字段）
  - 修改立即生效（按 namespace 的 `applies` 提示）；配置在外部被修改时提示重新加载，绝不覆盖；支持一键重启 Harness
- **窗口形状记忆** — 主窗口 / 外壳设置 / 插件商店 / Harness 设置窗口的尺寸与位置跨会话记忆，自动纠正屏幕外位置（换显示器 / 改分辨率后窗口不会"丢失"）

### 改进 / Improvements

- 插件商店：搜索按钮改为图标样式；初始窗口放大至 1100×760

### 说明 / Notes

- Windows 安装包使用本地测试证书链签名（`O=DeepWharf Contributors`），正式签名（SignPath Foundation）规划见 `CODE_SIGNING.md`

## [0.2.0] - 2026-08-15

### 新增 / New

- 内置插件商店：多数据源（npmmirror / npm 官方 / 社区精选 / GitHub 主题）、安装进度实时输出、安装后引导重启
- 内置精选社区源（awesome-dsh-plugin），仅展示声明 `dsh.bundle` 的可安装插件
- 外壳更新检查（GitHub Releases），与 Harness 更新检查并列
- 异步轮转日志（desktop.log / harness.log，单文件 ≤ 20MB），日志目录可一键打开 / 清除

### 改进 / Improvements

- 标准 semver 版本比较（含 rc/beta 元数据）
- Harness 更新后重新修剪冗余文件，保留许可证文本
- 单元测试与 CI 接入（`node --test`）

### 修复 / Fixes

- Harness 更新事务：新版本就绪前保留旧副本，失败自动回滚
