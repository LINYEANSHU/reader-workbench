# HTTP Agent API

Start `reader-workbench web --no-open`. The local service writes an owner-protected `connection.json` inside `--config-dir`; external clients read its URL and bearer token locally. Never paste the token into URLs, plugin settings or logs. The browser uses its authenticated same-origin cookie.

`GET /api/v1/openapi.json` returns the generated OpenAPI 3.1 schema. Each operation accepts JSON through `POST /api/v1/agent-tools/<operation>`. These operations share their schema, ownership checks and services with MCP. Existing `/api/v1/workspaces`, document, session, run, artifact, attachment and settings routes also serve the Web client. `POST /api/v1/runs` uses the same strict ask schema.

An ask requires `workspaceId`, `sessionId`, `question`, immutable `documents`, `attachmentIds`, `providerId`, `requestId` and `allowArtifactWrites`; `reasoningEffort` is optional. `ask_main` and `ask_temporary` validate session kind. Submit returns `{runId}` immediately. Read `get_run` or `get_run_events` with `afterSeq`; cancel through `cancel_run`. The REST stream `/api/v1/runs/<runId>/events?workspaceId=...&afterSeq=...` provides durable SSE IDs and supports `Last-Event-ID`.

`requestId` identifies an exact submission, including its session and arguments. Repeating it resumes the same run; changing its content is rejected. Temporary questions inherit only completed main turns and retain their own history. Cancellation and failure do not create completed turns.

Run `node scripts/http-client.mjs CONFIG_DIR` against the active daemon for a read-only example. Host, Origin, authentication, workspace-relative paths, immutable source versions and session ownership are checked. Generated schema and public errors contain no LLM key.
