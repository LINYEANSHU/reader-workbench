# 插件与外部工具

设置 → 插件可以从本机目录安装插件、安装两个随包示例、启用/停用、修改设置及重载。目录中必须包含 `plugin.json` 与入口模块。副本保存于所选工作区的 `.reader-workbench/plugins/<id>`；插件设置、启用状态及外部 MCP 连接配置按工作区分别保存。应用重启后恢复，某个扩展不可用会显示错误，不阻止核心阅读服务启动。

执行授权与工作区分开保存：安装插件或保存外部 MCP 连接时，宿主在用户配置目录的 `execution-trust.json` 中记录工作区路径、插件代码摘要、清单与设置（MCP 为连接配置）。打开工作区时只导入已授权且已启用的插件；资料目录自带的 `.reader-workbench` 记录、复制到其他路径的工作区、代码或设置被改动的插件，都显示为“尚未在本机授权”，不会执行，需在设置中点击“信任并启用”/“信任并连接”。随应用发布且未改动的内置插件运行应用自身的代码，无需单独授权。

插件是受信任的本机 JavaScript 代码，能够使用 Node.js 原生模块。manifest 权限约束 SDK 的工具影响和原生能力注册，**不是操作系统沙箱**。仅安装你信任的包。独立 SDK 不兼容 DeepSeek Harness 插件格式。Python 示例额外需要 Python 解释器；应用的内置语音识别不依赖它。

## 示例

- `reader-helper`：只读术语工具 `reader_explain_term`，字数设置，以及“把选区带到临时提问”动作。动作携带文档版本和选区，放入可编辑临时草稿，不会自动发送，也不更改主对话。
- `python-helper`：配置 Python 解释器路径后启用 `python_word_stats`。实际输入 `{"text":"你好 AI"}` 返回 `char_count: 5`。设置页的工具预览仅运行只读工具，结果不加入任何对话历史。
- `visual-document-memory`（1.0.0）：默认安装启用，明确停用状态保留。首次常规提问按首读计划处理：PDF/PPT/图片使用选定页图像，Markdown/Word 使用文本；选区提问跳过整篇预读。记忆保留逐页详情、公式/图表/术语条目和来源，支持补读、检索、回查和重建。现有未修改的内置副本自动升级，自定义副本保留。
- `document-translation`（1.0.0，本地开发新增）：默认安装启用，通过 `documentProcessor` 能力处理指定版本的全文或页码范围；文字选区不走文档处理，改由临时对话“询问 AI”回答。模型只接收文本块，不调用定位模型或 OCR。预览/下载不写入工作区，明确另存才创建新文件；PDF/PPT 为原页与译文伴随页对照，Word 为可编辑 DOCX，Markdown 包含本地图像资源。

一键翻译默认使用本地 CPU 中英互译，不需要 API Key。当前 Windows 开发目录已部署独立 Python、CTranslate2、OpenCC 和中英双向模型，约 309 MiB；推理期间不联网，也不修改系统 Python。翻译窗口可切换到已配置的 AI 模型。公式、代码、图像和来源定位继续由文档处理器保护；离线模型适合一般正文，专业术语请结合预览校对。

运行目录依次取 `READER_TRANSLATION_RUNTIME`、应用根目录的 `.reader-runtime/translation`、用户配置目录中的 `translation`。新机器可使用 Python 3.12 执行 `scripts/setup-local-translation.ps1 -Python <Python3.12路径>` 下载独立运行库与官方模型；下载仅发生在显式安装时。运行文件不提交到 Git，当前源码包包含安装脚本与工作进程，不包含这些二进制模型。缺少资源时界面提示安装，不会自动下载或要求配置云端模型。

## 文档处理扩展（本地开发）

`context.register('documentProcessor', 'your-plugin.processor', processor)` 注册 `DocumentProcessor`。宿主固定文档版本、会话所有权、模型租约与输入容量，提供受控源文件、PDF 文字块及实际几何信息、版本资源、转换与导出能力。插件报告进度并返回实际文件字节、MIME、扩展名和提示；宿主复核结果后提供预览，只有显式保存才获得工件写入权限。任务取消、会话清空和版本/所有权检查由宿主处理，预览任务重启后需重新开始。

阅读上下文的 `documentReadScopes` 将文档版本和允许页码固定到每次运行；普通源读取与记忆工具共同遵守该范围，选区提问不允许通过普通源工具扩大阅读。插件上下文变换不能修改此字段。旧记忆 schema v1 仍可读取，新增可选 `overviewPages` 记录概览覆盖页，范围变化时只对当前所选页重新生成概览。

## 文档记忆扩展（SDK 协议 1.1.0）

当前 SDK 协议为 1.2.0，保持本节 1.1.0 文档记忆扩展的兼容。 `ModelRequest.maxOutputTokens` 与能力中的同名字段仅兼容旧插件，适配器忽略它们；新插件应省略该字段。未经修改的旧内置阅读插件自动使用随包新版实现，自定义副本保持原样。新增 `ModelProvider.contextWindowSource`、可选的 `resolveCapabilities(signal)`，以及 `MemoryProvider.summarize` 的可选第四参数 `SummaryContext`（系统消息、工具定义、既有摘要）；原有三参数摘要插件仍可使用。

`context.register('documentMemory', 'your-plugin.reader', provider)` 注册 `DocumentMemoryProvider`。实现 `promptVersion`、`supports(record)`、`prepareLocal(host, signal)`、`prepare(host, signal)`、`select(record, question, budgetBytes)`。`DocumentImageHost` 提供受控页码图像和本地文字；`DocumentMemoryHost` 额外提供已租约固定的模型能力、图像限制、加载/原子保存记忆、无工具的模型调用和进度。

应用宿主负责工作区与来源版本授权、严格记忆结构/页码覆盖校验、缓存原子保存、共享任务、租约及取消；插件负责阅读提示、顺序分批、概览和相关页选择。完整原文与页记忆保留；上下文装不下全部记忆时发送概览、完整页码索引和相关页，模型可用 `read_document_memory` 读取其他页，用 `revisit_document_page` 核实指定一页图像。

缓存位于工作区内部存储的 `document-memory/<hash>/generation-<n>.json`，哈希覆盖工作区/文档/内容版本/插件/提示版本/模型身份。一般内部存储是 `.reader-workbench`；复制的工作区可能使用 `.reader-workbench/identities/<workspace-id>`。原文及页图像在同一内部存储的 `cache/<document-id>/<version>`。重建只递增本地代次，保留旧记录；下一次提问才调用模型。非法或不完整输出不会标记全文读完，已完成批次可继续。

DeepSeek 的接口是无状态调用。所谓“记忆”是每次请求中明确提供的本地模型阅读记录与历史摘要，不能代替原文件中的所有细节。`api.deepseek.com` + `deepseek-flash` 使用 600 张、单图 32 MiB、图像累计 64 MiB、请求体 48 MiB 的上限；按输入容量和图像发送限制分批；所有模型请求只限制输入（固定 1,000,000 token），输出使用供应商默认值，不发送输出 token 上限。其他端点默认 4 张、单图 4 MiB、累计 12 MiB、请求体 16 MiB，可通过模型设置 `imageLimits` 覆盖。

最小 manifest：

```json
{"id":"my-reader","version":"1.0.0","sdkRange":"^1.0.0","entry":"index.mjs","dependencies":[],"permissions":["tool:read"],"settingsSchema":{"type":"object","properties":{}}}
```

入口导出 `default { async activate(context), async dispose() }`。通过 `context.register(kind, "my-reader.<name>", implementation)` 注册；返回的函数撤销该注册。能力名必须在插件自己的命名空间，`core` 保留。工具名也应使用自己的唯一名称。`settings` 是当前启用时的设置快照；修改设置会等待旧调用结束再重新启用。依赖先启用、后停用；重载按依赖关系释放，与安装顺序无关。

停用立即阻止新调用，等已持有的 lease 释放后再执行 dispose。刷新工具 schema 时，旧调用仍使用旧定义。所有资源必须在 dispose 中释放；原生热键注册会先注销，以免持续 lease 阻止停用。插件应响应调用的 AbortSignal，事件监听不得执行阻塞主线程的操作。

密钥不得放在插件设置中，使用 `credentialRef` 引用本机私有凭据；连接界面从不回传密钥。

## 已接通的扩展消费者

| SDK 能力 | 实际消费入口 | 验证 |
| --- | --- | --- |
| Model | RunService 生成与思考档位 | plugin-consumers、model-adapter、runs |
| Document | DocumentService 版本解析队列 | plugin-consumers、runs |
| Viewer | DocumentService 生成受控 viewer 描述 | plugin-consumers；阅读浏览器测试 |
| Tool | ToolRegistry → ToolExecutor，JSON Schema 与影响检查 | plugin-extension、runs |
| Exporter | ArtifactService 实际写文件 | plugin-consumers、artifacts |
| Memory | ContextBuilder 超预算时选择摘要 provider | context-budget，保留原始轮次与来源范围 |
| Context | ContextBuilder 合并后按预算、文档版本及会话边界验证 | plugin-consumers、context-budget |
| Storage | 各服务的五类 typed store ports | plugin-consumers：实际读写、事件序号、父会话隔离 |
| Hooks | 启动、工作区选择、文档打开、持久化运行事件 | plugin-consumers：慢监听不阻塞另一会话，错误可见 |
| UI | 安全描述视图、设置表单与临时会话动作 | plugin-extension；plugins.spec 浏览器安装/使用 |
| Workspace | `/api/v1/directories?workspaceId=...` 的已授权目录浏览 | plugin-consumers |
| Layout | 已验证的布局预设目录和前端布局选择 | layout.spec：有效预设使用、无效预设拒绝 |
| Selection | SelectionService 版本校验和临时目标 | plugin-consumers、selection-actions、selection.spec |
| Capture | 默认浏览器 provider；可选原生插件捕获桥 | capture.spec 实际浏览器像素；plugin-consumers 受控 native provider |
| Hotkey | 默认网页内热键；可选全局注册/事件/注销桥 | hotkeys、capture.spec；plugin-consumers 实际注册回调与注销 |
| Process | ToolRegistry 进程 provider → 独立 argv/stdin JSON 进程 | plugin-extension：真实 Python、中文、错误、取消、超时和进程树清理 |
| Speech | 已认证会话的 SpeechService → 两个输入框的离线转写 | speech、speech-native、voice-input：真实模型、音频、取消、草稿与麦克风释放 |

Viewer/UI 返回受控描述，不能向页面注入任意 HTML 或执行插件脚本。视图支持 Markdown/纯文本，Markdown HTML 与远程图片不执行/加载。

SpeechProvider 必须声明 `processingLocation: "local"` 和支持语言，提供 `prepare(signal, onProgress)`、`transcribe({samples, sampleRate:16000, seconds}, language, signal)`、`dispose()`。任务持有 provider lease，按引擎实例串行执行；识别结果只返回文字和计时，不写任何会话。插件必须响应取消信号。内置 `core.sensevoice` 用受管理的原生子进程，可硬取消正在进行的推理。HTTP 路径为 `/api/v1/workspaces/:id/sessions/:sessionId/speech/{catalog,prepare,transcribe,jobs/:jobId,jobs/:jobId/cancel}`，`requestId` 由客户端生成；录音按严格的单声道 16 kHz PCM16 WAV 限制验证，最长 120 秒且不落盘。

### Storage

`open(root, {workspaceId, base})` 返回 WorkspaceStore，提供 documents/sessions/runs/artifacts/attachments。`base` 是显式 typed facade，未暴露 SQLite 对象、私有运行身份表或 bindScope。当前实现适用于围绕持久化端口的缓存、审计和委托适配；适配器必须保留原子提交、版本、事件序号和工作区隔离的契约。会话写入先通过核心身份校验。不要在启停时自动迁移已有工作区到另一后端；独立后端迁移需要单独设计并验证，当前没有自动迁移工具。适配器持有的资源通过插件 dispose 及返回 store.close 管理，close 应可重复调用。

### Hooks

`onEvent({kind, workspaceId, data})` 每个监听独立排队，不阻塞运行提交或其他监听。kind 包括 `server.started`、`workspace.selected`、`document.opened`、`run.event`。回调收到事件副本；历史事件不会在重启后自动重放。监听错误保存为受控诊断，可在设置页查看，或读取 `/api/v1/workspaces/<id>/plugins/hook-errors`；不回传原始异常。排队最多 1024 个任务，诊断最多保留 200 条。回调必须结束，停用会等待已接收的事件。

## 外部 MCP

设置页支持本机 stdio 和 Streamable HTTP：程序路径 + JSON argv，或服务 URL + 单独的访问令牌。配置 `effects` 按远端工具原名映射为 `read`、`write_artifact`、`write_session` 或 `external_write`。未配置影响的工具默认 `external_write`，临时对话会拒绝。标注为 read 不能获得主会话写权限；客户端不会将 Reader 的密钥、Bearer、RunScope 或内部路径发给远端。

工具名为 `mcp_<连接名>_<远端名称>`；超 64 字符时截断并加稳定摘要，规范化冲突拒绝连接。发现和调用使用官方 MCP Client v2；手动刷新及 `tools/list_changed` 更新 schema。HTTP 取消同时中止对应 fetch，兼容旧协议使用取消通知时仍能关闭本次网络请求。远端是否终止其后台任务取决于服务对断连/取消的实现。

stdio 命令无 shell；环境采用 SDK 的最小默认环境，不传模型凭据。断开等待在途调用 lease 释放，关闭连接与自有子进程。

HTTP 管理：

- `GET/PUT /api/v1/workspaces/<id>/external-mcp`：列表/保存并连接，PUT 输入 `{config, secret?}`。
- `POST .../external-mcp/<connectionId>/enable|disable|refresh`。
- `GET .../plugins/tools`：工具定义。
- `POST .../plugins/tools/<toolName>/call`：只读预览，输入 `{sessionId, input}`，必须使用所属临时会话。

这些接口使用同一守护进程、工作区存储及身份检查，见 [API](api.md) 和 [MCP Server](mcp.md)。

## Python/进程协议

一次调用启动独立命令，`shell:false`；中文、空格和 shell 元字符按原样参数/JSON 数据传递。stdin 一行：

```json
{"version":1,"id":"调用 UUID","tool":"python_word_stats","input":{"text":"你好 AI"},"scope":{"workspaceId":"...","sessionId":"...","runId":"...","callerId":"...","allowArtifactWrites":false}}
```

stdout 必须一行 `{version:1,id,result:{content,data?}}` 或 `{version:1,id,error:{...}}`。诊断写 stderr；错误输出不会直接进入公开异常。超时范围 10–120000ms；取消/超时终止进程树。scope 不含 token、API Key、工作区根路径或父仓库。进程需要工作区数据时应调用有权限检查的核心 HTTP/MCP 服务。

## 可选原生辅助程序

默认截图/快捷键使用浏览器内置能力。插件若提供 `authorization:"native"` 的 CaptureProvider 或 `scope:"global"` 的 HotkeyProvider，manifest 必须声明 `native:capture` / `native:hotkey`，platforms 必须包含当前 Node 平台。OS 授权、安装、注销和媒体清理由该受信任辅助程序实现。

已接通的受认证桥：

- `GET .../plugins/native`：适用于本机的 provider 列表。
- `POST .../plugins/native/capture`：`{providerId,sessionId,document?,rect?}`，PNG 校验后保存为该临时会话的附件。
- `POST .../plugins/native/hotkeys`：`{providerId,sessionId,binding}`，返回注册 id。
- `POST .../plugins/native/hotkeys/<id>/events`：`{sessionId,after?}`，返回至多 64 个回调事件及 lastSeq；调用方按注册会话处理事件。
- `DELETE .../plugins/native/hotkeys/<id>`：`{sessionId}`，注销。调用方应在切换/关闭时注销；停用插件和关闭 daemon 也会注销。

本项目验证了受控 provider 的实际捕获调用、全局注册回调及释放；没有交付 OS 全局快捷键辅助程序。真实浏览器屏幕截图另有 Windows Chrome 的像素验证，macOS/Linux OS 授权与辅助程序尚未实机验证。
