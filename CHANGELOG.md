# Changelog

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。所有值得注意的变更都会记录在此文件。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

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
