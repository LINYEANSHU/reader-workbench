# HTTP Agent API

Start `reader-workbench web --no-open`. The local service writes an owner-protected `connection.json` inside `--config-dir`; external clients read its URL and bearer token locally. Never paste the token into URLs, plugin settings or logs. The browser uses its authenticated same-origin cookie.

`GET /api/v1/openapi.json` returns the generated OpenAPI 3.1 schema. Each operation accepts JSON through `POST /api/v1/agent-tools/<operation>`. These operations share their schema, ownership checks and services with MCP. Existing `/api/v1/workspaces`, document, session, run, artifact, attachment and settings routes also serve the Web client. `POST /api/v1/runs` uses the same strict ask schema.

An ask requires `workspaceId`, `sessionId`, `question`, immutable `documents`, `attachmentIds`, `providerId`, `requestId` and `allowArtifactWrites`; `reasoningEffort` is optional. `ask_main` and `ask_temporary` validate session kind. Submit returns `{runId}` immediately. Read `get_run` or `get_run_events` with `afterSeq`; cancel through `cancel_run`. The REST stream `/api/v1/runs/<runId>/events?workspaceId=...&afterSeq=...` provides durable SSE IDs and supports `Last-Event-ID`.

`requestId` identifies an exact submission, including its session and arguments. Repeating it resumes the same run; changing its content is rejected. Temporary questions inherit only completed main turns and retain their own history. Cancellation and failure do not create completed turns.

Run `node scripts/http-client.mjs CONFIG_DIR` against the active daemon for a read-only example. Host, Origin, authentication, workspace-relative paths, immutable source versions and session ownership are checked. Generated schema and public errors contain no LLM key.
# 文档阅读记忆 API（0.2.0）

以下入口均要求现有本地认证和工作区所有权，固定文档内容版本；`providerId` 必须是已配置的模型标识。

| 请求 | 路径 | 行为 |
| --- | --- | --- |
| GET | `/api/v1/workspaces/:id/documents/:documentId/:version/memory?providerId=...` | 状态、已完成页码、概览及本地图像准备状态 |
| GET | 上述路径 + `/pages/:page?providerId=...` | 指定页的完整结构化记忆 |
| POST | 上述路径 + `/rebuild`，JSON `{ "providerId": "..." }` | 递增本地记忆代次，保留旧记录，不调用模型 |

状态为 `not-started`、`partial`、`ready` 或 `disabled`。未建立页记忆返回 404；模型未声明视觉能力时首次预读明确失败，不自动更改配置。首次提问通过原有运行 API 触发预读，进度以持久 `progress` 事件返回；后续运行保存使用的记忆引用用于审计。重看页工具只将授权的一页图片添加到当前模型请求，不保存到对话消息或工具结果。

# 模型 Token 用量

`GET /api/v1/workspaces/:id/usage` 返回本工作区全部主对话和临时追问的累计用量，字段与模型统计一致但没有 `modelId`、`model`。它汇总所有已保存的模型用量记录（包括历史连接配置），不会再次叠加会话索引；清空会话和重启不清零。缓存命中率为已回传缓存字段的 `cachedInputTokens / cacheEligibleInputTokens`，不是各会话命中率的平均值。底部统计栏使用此接口，上下文占用仍按当前会话及所选模型分别读取。

`GET /api/v1/workspaces/:id/settings/models/:modelId/usage` 返回已保存连接的本地累计统计：`inputTokens`、`outputTokens`、`totalTokens`、`requests`、`reportedRequests`、`missingUsageRequests`、`trackedSince` 和 `lastRequest`。最近一次请求包含时间、输入/输出/合计和 `completed` / `failed` / `cancelled` 状态；没有有效 `usage` 时三个 token 字段均为 `null`，没有请求时 `lastRequest` 和 `trackedSince` 为 `null`。

计数来自 OpenAI compatible 流式响应的 `usage.prompt_tokens` / `usage.completion_tokens`，每个 HTTP 请求只取最后一次有效快照。主对话、临时追问、工具续答、文档预读与概览都经过相同统计入口。失败或取消不清除已回传的计数；缺失、字段不完整或无效的计数不作估算。

记录保存在工作区数据库中，按配置名称、规范化完成接口和模型名称隔离。修改模型能力或重启不清零；同一配置切换到其他模型或服务地址后显示对应的独立统计。仅涵盖此功能启用后的本工作区请求，不能追溯旧调用或其他客户端用量，也不代表账户余额或剩余额度。API Key 不进入统计记录或响应。

# 会话统计与提示词

`GET /api/v1/workspaces/:id/sessions/:sessionId/usage?providerId=...` 返回当前会话、模型和清空代次的统计。沿用模型累计字段，并增加 `sessionId`、`context`、`cachedInputTokens`、`uncachedInputTokens`、`cacheEligibleInputTokens`、`cacheReportedRequests` 和 `cacheHitRate`。辅助预读、摘要和工具续答归入触发它们的会话；临时分支不叠加父会话的累计用量。重启保留统计，清空临时分支后开始新的统计代次。

缓存采用 DeepSeek 的 `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`，兼容 `prompt_tokens_details.cached_tokens`。只回传命中数时，未命中数由输入减命中计算。缺失或非法缓存字段不按零命中处理；命中率为有效请求累计命中输入除以累计输入，未报告缓存的请求不进入分母。旧统计不补造缓存数。

`context` 为最近一次回答请求的 `{ usedTokens, limit, estimated, capacitySource, reservedOutputTokens }`；`usedTokens` 优先采用服务报告的输入 token，未回传时采用明确标注的保守本地估算。`limit` 固定为 `1000000`，`capacitySource` 为 `application`，兼容字段 `reservedOutputTokens` 为 `0`。累计 `totalTokens` 仍包括输入与输出；文档预读及压缩调用不会覆盖回答上下文。流式运行的 `context` 事件也包含 `contextUsage`。旧记录保留当时的统计值。

本地输入上限统一为 `1000000` token，包含提示词、历史、工具定义、工具结果与图像估算。主回答、工具续答、文档预读、概览和 AI 压缩均不发送 `max_tokens`、`max_completion_tokens` 或 `max_output_tokens`，输出长度由供应商默认决定。旧配置及插件的 `maxOutputTokens`、`autoDiscoverContext` 仍可读取，但不再控制请求；设置接口返回规范化后的固定输入容量，并移除旧输出限制。读取模型列表只用于选择模型及其图像/思考能力。

文档预读遇到供应商输出截断或逐页记忆格式错误时，将多页批次对半拆分后重试；成功批次立即保存。单页仍失败时明确报错，不保存无效或缺页的记忆。历史安装中未经修改的内置阅读插件自动使用当前随包实现，自定义插件文件保持原样。

`GET` / `PUT /api/v1/workspaces/:id/settings/agent` 读取和保存本机全局提示词偏好，工作区参数保留用于认证与兼容。字段：`preset`（`professional`、`friendly`、`candid`、`efficient`），`systemPrompt`、`personalPrompt`，`friendliness` 和 `enthusiasm`（`enhanced`、`default`、`reduced`），`visualLayout`（`default`、`concise`），`headingsLists`（`enhanced`、`default`、`concise`）。提示词各最多 16,000 字符，系统提示词不能为空；非法字段返回 `AGENT_SETTINGS_INVALID`。下一次构建请求时读取设置，来源和权限规则仍由应用附加。

上下文约达到容量的 80% 时，用所选 AI 生成检查点，并按约 16% 容量保留近期完整轮次；复用已保存检查点，不删除原始轮次。工具续答压力也会触发压缩。确认模型端上下文超限时，只有尚未输出文本、思考或工具调用的请求才压缩重试一次；已执行的工具不会重复执行。正在解读的图像保留；单次问题或必要图像本身超限、摘要无有效缩减、压缩失败或取消时明确失败，不伪造成功。

# 本机全局设置与主对话归档

`GET` / `PUT /api/v1/workspaces/:id/settings/models` 读取和保存本机共享模型连接。路径中的工作区用于权限检查和注册能力，模型配置本身存放在用户配置目录 `agent/models.json`，密钥存放在同目录 `credentials.json`，响应只包含凭据引用和 `hasKey`。旧工作区配置首次加载时迁移；重名连接会生成稳定的新名称，`migratedFrom` 用于首次恢复旧选择，用量记录仍留在所属工作区。

`GET /api/v1/settings/preferences` 返回 `{providers, efforts, captureBinding}`，首次未保存时为 `null`。`PUT` 接受这些字段的部分更新，分别合并 `main`、`temporary` 的模型和思考档位。数据保存在用户配置目录 `agent/ui-preferences.json`；工作区 UI 状态不再保存这些个人选项。

`PUT /api/v1/workspaces/:id/sessions/:sessionId/archive` 接受 `{ "archived": true }` 或 `{ "archived": false }`，返回带可选 `archivedAt` 的会话记录。只允许会话所属调用者操作主对话；归档不删除历史、记忆、运行、生成文件或临时分支，也不取消正在执行的请求。会话列表与历史接口保留归档信息，便于恢复。

# 阅读与翻译接口（2026-10-18 本地开发）

`GET /api/v1/directories/browser?path=...&workspaceId=...` 返回 `{path,parent,entries,roots}`，本机路径规范化后供目录树、地址栏和面包屑使用；原 `/directories` 数组接口保留。

文档前缀为 `/api/v1/workspaces/:id/documents/:documentId/:version`：

| 方法与后缀 | 行为 |
| --- | --- |
| `GET /reading-plan` | 返回 `{pages,pageCount,mode,configured}`，缺省全部页且 `configured=false` |
| `PUT /reading-plan`，`{pages:[2,3,10,11]}` 或 `{pages:null}` | 保存指定页集或全部页，不调用模型 |
| `GET /memory/search?providerId=...&query=...&kind=formula` | 检索已完成页的公式/图表/术语，返回真实 `anchor` 与 `granularity` |

记忆状态增加 `selectedPages`、`selectedCompletedPages`、`rangeComplete`、`fullDocumentComplete` 与 `mode`。页码用一基整数数组，非法页码拒绝；用户界面的范围表达式先规范化为数组。运行上下文保存 `documentReadScopes`，将页面权限固定到本次运行，普通源工具与记忆工具均遵守该页集。Markdown/Word 使用文本预读，选区提问不触发文档预读。

翻译任务前缀为 `/api/v1/workspaces/:id/document-processing`：

| 方法与后缀 | 行为 |
| --- | --- |
| `GET` | 列出已启用处理器 |
| `POST` | 接受 `{document,providerId,sessionId,processorId,targetLanguage?,pages?}`，返回任务；带 `selection` 的请求被拒绝 |
| `GET /:taskId?sessionId=...` | 读取状态、进度、警告、错误与预览元数据 |
| `POST /:taskId/cancel`，`{sessionId}` | 取消任务，完成回调不能将取消状态覆盖为可用预览 |
| `GET /:taskId/preview?sessionId=...` | 返回实际文件字节，`Cache-Control: no-store` |
| `POST /:taskId/save`，`{sessionId,name?}` | 显式另存工件，不覆盖原文，返回工件记录 |

任务绑定文档版本、会话所有者与清空代次；跨会话访问拒绝。预览和下载不写入工作区，任务与预览在服务重启后不恢复。内置处理器 ID 为 `document-translation.translate`，扫描页不自动 OCR；PDF/PPT 为原页和译文伴随页的对照 PDF，Word 预览页子集不能映射到 DOCX 时明确拒绝。
