# 插件与外部工具

设置 → 插件可以从本机目录安装插件、安装两个随包示例、启用/停用、修改设置及重载。目录中必须包含 `plugin.json` 与入口模块。副本保存于所选工作区的 `.reader-workbench/plugins/<id>`；插件设置、启用状态及外部 MCP 连接配置按工作区分别保存。应用重启后恢复，某个扩展不可用会显示错误，不阻止核心阅读服务启动。

插件是受信任的本机 JavaScript 代码，能够使用 Node.js 原生模块。manifest 权限约束 SDK 的工具影响和原生能力注册，**不是操作系统沙箱**。仅安装你信任的包。独立 SDK 不兼容 DeepSeek Harness 插件格式。Python 示例额外需要 Python 解释器；应用的内置语音识别不依赖它。

## 示例

- `reader-helper`：只读术语工具 `reader_explain_term`，字数设置，以及“把选区带到临时提问”动作。动作携带文档版本和选区，放入可编辑临时草稿，不会自动发送，也不更改主对话。
- `python-helper`：配置 Python 解释器路径后启用 `python_word_stats`。实际输入 `{"text":"你好 AI"}` 返回 `char_count: 5`。设置页的工具预览仅运行只读工具，结果不加入任何对话历史。

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

Viewer/UI 返回受控描述，不能向页面注入任意 HTML 或执行插件脚本。视图支持 Markdown/纯文本，Markdown HTML 与远程图片不执行/加载。

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
