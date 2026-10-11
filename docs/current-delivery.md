# 当前版本交付：2026-10-12

应用已实际启动于 http://127.0.0.1:4317，当前用户服务保留运行。后续验收的配置、缓存和临时目录已限制在 G:\My_project\try 内；未调用你禁止使用的测试 API。

## 启动与使用

需要 Node.js 24 或更新版本。源码、构建产物及实际准备好的 Office/语音运行资源位于：

```powershell
G:\My_project\try\.worktrees\reader-workbench
```

这台电脑上的日常启动入口：

```powershell
& 'G:\My_project\try\.worktrees\reader-workbench\Start-Reader.ps1'
```

脚本已实际运行，核对新启动的 Node 进程属于此脚本，并验证真实 HTTP health 200。它复用本轮本地 LibreOffice 和 SenseVoice 模型，默认配置目录为 `.reader-runtime/user-config`，临时目录为 `.reader-runtime/tmp`。不自动配置测试凭据，不默认启用演示模型。当前 4317 服务已运行；启动另一实例可加 `-Port 4318 -ConfigDir '另一私有配置目录'`。`-NoOpen` 可禁止自动打开浏览器，`-Demo` 仅供明确的协议演示。

先选择工作区，再从文件树打开文档，在设置中填写兼容 OpenAI Chat Completions 的 Base URL、模型和 API Key。两个对话栏分别选择模型、思考深度并支持本地语音；停止录音后先编辑文字，按发送才向 LLM 请求。

文件、主对话、临时对话三个栏支持拖动排列、横向/纵向/混合分割及每栏独立缩放。临时对话继承最新完成的主记忆和自身追问，答案不回写主对话。原文件及 Agent 生成文件都可在文件栏打开；选字右键进入临时询问，截图快捷键可修改。

原文件保留。生成文件位于所选工作区的 `outputs/<session>/`，文档缓存与历史位于工作区的 `.reader-workbench`。插件与外部 MCP 设置也按工作区保存。应用拥有独立 SDK、17 类已接通扩展能力、HTTP API、MCP HTTP/stdio，以及 Python 工具示例。见 [插件说明](plugins.md)、[HTTP API](api.md)、[MCP Server](mcp.md)。

## 本轮实际检查

- 新鲜依赖安装、14 个自生成样例的哈希、类型检查、构建全部通过。
- 核心单元/集成 **96/96**、浏览器 **26/26** 通过。包括空目录安装发行包、主临时隔离、Workspace 切换、插件/Python/外部 MCP、真实截图、恢复、取消、思考档位协议及语音。
- LibreOffice 深路径缺陷已完成回归 RED 到 GREEN。转换用短私有临时目录；持久预览仍回到原工作区，原文件不改变。
- 全部 **20 页**源 PDF/DOCX/PPTX/DOC/PPT/扫描页与生成 DOCX/PPTX/PDF 已实际渲染并检查；中文、图片、表格、公式及来源范围可读，未发现缺字、交叠或截断。扫描页明确未执行 OCR。
- 实际内置 SenseVoice 识别中文与英文合成音频，两个会话历史均未改写。浏览器麦克风管道重放、拒绝授权、修改草稿、取消和切换释放资源都有测试。
- 新增 PowerShell 启动脚本从实际失败修正后，真实进程身份与 HTTP 验证通过；用户应用保留运行。

原始证据见 [验收索引](evidence/2026-10-12/manifest.json)、[启动检查](evidence/2026-10-12/launcher.json)、[逐页清单](evidence/2026-10-12/rendered/pages.json)和 [语音 CLI](evidence/2026-10-12/voice-cli.json)。完整流程使用协议模型的结果单列，不代替真实 LLM 验收。

## 明确未测及收尾状态

- 本次最终真实 API 与真实思考档位调用未执行，遵守用户“未经再次批准不得调用测试 API”的指示。早期实际 API 结果不冒充本次的新鲜验收。
- macOS/Linux 平台入口、原生依赖和 CI matrix 已提供；本轮没有真实机器/CI 结果，仍标记 not-tested。
- 人工物理麦克风、OS 手工选择器与可选全局快捷键 helper 未实测；网页热键与实际浏览器捕获已测。没有声称内置系统全局 helper。
- 最终独立全分支代码审查即将进行，沿用用户指定的当前模型；正式源码提交、发行包和本地集成决定将在收尾记录中补充。

先前自动审批用量限制已经解除；本轮命令均继续通过环境正常审批。仅按后来授权清理已核实的测试进程；未关闭 Codex 或其他既有进程，用户应用仍运行。
