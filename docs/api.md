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
