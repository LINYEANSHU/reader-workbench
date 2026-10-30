# 验收与证据

> 自 2026-10-29 起，当前维护范围仅为 Windows。CI 对同一提交运行完整的 Windows 构建、测试和安全审计；macOS/Linux 停止维护和发布。下列带日期的内容保留为历史验收记录，不代表当前提交的运行结果。

Windows CI 显式准备并启用真实离线翻译、Cognee 和语音运行库。单元/集成与浏览器测试同时生成 JSON 报告，存在跳过、待执行或失败的测试会导致 CI 失败。运行库、模型、测试配置和报告只留在忽略目录及 CI 临时环境中，不进入 Git 或安装包。

## 0.2.0 文档阅读记忆（2026-10-12）

Windows / Node 24.21.0：`npm run typecheck`、`npm run build` 通过；`npm test` 为 31 个文件、127 项通过，包含真实 LibreOffice 转换、离线语音和新目录安装发行包；`npm run test:e2e` 为 35 项通过，包含原生截图、7 页全文预读、后续零图像、刷新与重建。此轮没有跳过资源测试。macOS/Linux 本轮未运行。

已授权的真实 `deepseek-flash` 验收使用自生成 2 页文档：预读发送 2 张图，概览请求、首次答案和后续答案均为 0 张图；两个答案请求携带本地记忆，保存的对话不含图像 Base64。已找到并使用原配置目录的凭据，证据不记录 Key。真实验收仅覆盖此两页样例；7 页分批、取消、停用和恢复由本地协议与浏览器测试覆盖。

独立全分支审查的三项重要问题均先复现失败再修复：预读期间停用插件仍保持该次运行的租约、同名未注册插件保留原目录并记录诊断、上下文与回看使用模型配置的图像 token 预算。没有延后的小问题。记录、截图和哈希见 `docs/evidence/2026-10-12/visual-document-memory/manifest.json`；真实模型证据见 `docs/evidence/2026-10-12/visual-memory-live.json`。

测试区使用自生成的 CC0 文档、图片和合成音频，不含用户原文与凭据。最终 `docs/evidence` manifest 对 R01–R25 列出命令、平台、文件哈希、证据位置和 `passed`、`failed` 或 `not-tested` 状态。

真实 DeepSeek API、原生本地语音、LibreOffice 实际转换与测试用协议模型分开记录。协议测试验证流式输出、工具调用和异常，不能代替真实模型可用性。语音测试通过实际麦克风管道重放音频并运行真实模型；手工物理麦克风测试仍单列。

Windows 是本轮实际运行的平台。macOS/Linux CI 配置和原生依赖可供验证；未运行 CI 或真实机器时仍标记 `not-tested`，不会由配置文件推断通过。浏览器屏幕捕获有真实 Chrome 自动授权证据，手工 OS 选择器交互及全局快捷键 helper 单列。

```sh
npm run acceptance -- --workspace /path/to/owned-test-workspace
npm run test:live -- --workspace /path/to/owned-test-workspace --provider configured-provider --config-dir /path/to/private-config
```

完整验收脚本执行新鲜安装、类型检查、构建、单元/集成与浏览器测试，再生成证据索引。外部 MCP、Python 工具、进程取消、工作区切换、主临时隔离和生成文件重开包含在测试中。缺少真实语音缓存或 LLM 配置时，相关真实验收明确记录未测。
