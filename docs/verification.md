# 验收与证据

测试区使用自生成的 CC0 文档、图片和合成音频，不含用户原文与凭据。最终 `docs/evidence` manifest 对 R01–R25 列出命令、平台、文件哈希、证据位置和 `passed`、`failed` 或 `not-tested` 状态。

真实 DeepSeek API、原生本地语音、LibreOffice 实际转换与测试用协议模型分开记录。协议测试验证流式输出、工具调用和异常，不能代替真实模型可用性。语音测试通过实际麦克风管道重放音频并运行真实模型；手工物理麦克风测试仍单列。

Windows 是本轮实际运行的平台。macOS/Linux CI 配置和原生依赖可供验证；未运行 CI 或真实机器时仍标记 `not-tested`，不会由配置文件推断通过。浏览器屏幕捕获有真实 Chrome 自动授权证据，手工 OS 选择器交互及全局快捷键 helper 单列。

```sh
npm run acceptance -- --workspace /path/to/owned-test-workspace
npm run test:live -- --workspace /path/to/owned-test-workspace --provider configured-provider --config-dir /path/to/private-config
```

完整验收脚本执行新鲜安装、类型检查、构建、单元/集成与浏览器测试，再生成证据索引。外部 MCP、Python 工具、进程取消、工作区切换、主临时隔离和生成文件重开包含在测试中。缺少真实语音缓存或 LLM 配置时，相关真实验收明确记录未测。
