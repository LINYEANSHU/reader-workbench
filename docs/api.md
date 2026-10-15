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

`context` 为最近一次回答请求的 `{ usedTokens, limit, estimated, capacitySource, reservedOutputTokens }`；`usedTokens` 优先采用服务报告的输入加输出。发送前及未回传用量时采用明确标注的保守本地估算。它与跨请求累加的 `totalTokens` 不同，文档预读及压缩调用不会覆盖回答上下文。流式运行的 `context` 事件也包含 `contextUsage`。

模型连接可设置 `autoDiscoverContext`（缺省开启）。首次运行尝试读取 `/models` 中对应模型明确给出的容量，失败、超时、无容量字段时回退至用户保存的 `capabilities.contextWindow` 与 `maxOutputTokens`。读取不改写手填值，也不采用模型回答中的自述容量；设置为 `false` 可始终使用手填容量。

`GET` / `PUT /api/v1/workspaces/:id/settings/agent` 读取和保存工作区提示词偏好。字段：`preset`（`professional`、`friendly`、`candid`、`efficient`），`systemPrompt`、`personalPrompt`，`friendliness` 和 `enthusiasm`（`enhanced`、`default`、`reduced`），`visualLayout`（`default`、`concise`），`headingsLists`（`enhanced`、`default`、`concise`）。提示词各最多 16,000 字符，系统提示词不能为空；非法字段返回 `AGENT_SETTINGS_INVALID`。下一次构建请求时读取设置，来源和权限规则仍由应用附加。

上下文约达到容量的 80% 时，用所选 AI 生成检查点，并按约 16% 容量保留近期完整轮次；复用已保存检查点，不删除原始轮次。工具续答压力也会触发压缩。确认模型端上下文超限时，只有尚未输出文本、思考或工具调用的请求才压缩重试一次；已执行的工具不会重复执行。正在解读的图像保留；单次问题或必要图像本身超限、摘要无有效缩减、压缩失败或取消时明确失败，不伪造成功。
