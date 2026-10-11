# Calling Reader Workbench from another Agent

Reader exposes the existing daemon at `http://127.0.0.1:4317/mcp` with Streamable HTTP and bearer authentication. The official MCP TypeScript v2 packages are pinned in package-lock.json. No separate workspace database is created by either transport.

For a stdio-only Agent, configure command `reader-workbench` with arguments `mcp --config-dir PATH_TO_READER_CONFIG`. Start the Web service first with that same config directory. The bridge reads its private connection record, forwards to `/mcp`, and writes only MCP protocol on stdout. Optional `--url LOCAL_URL --token-file PRIVATE_TOKEN_FILE` connects an explicitly supplied local endpoint. Closing stdin or cancelling the bridge closes both SDK transports; diagnostics belong on stderr.

Available tools: `list_workspaces`, `select_workspace`, `list_workspace_files`, `open_document`, `read_document_page`, `search_document`, `create_reading_session`, `ask_main`, `ask_temporary`, `get_run`, `get_run_events`, `cancel_run`, `list_artifacts`, `open_artifact`, `list_plugins`.

Resources use immutable identifiers:

- `reader://<workspaceId>/documents/<documentId>/<version>/pages/<page>`
- `reader://<workspaceId>/sessions/<sessionId>`
- `reader://<workspaceId>/artifacts/<artifactId>`

Open operations return processing run IDs. Query `get_run` before reading a page still being converted. Asking returns immediately with a run ID, so a client can continue reading, follow durable events or cancel. Resource results strip internal cache image paths; artifact paths are workspace-relative.

`node scripts/mcp-client.mjs CONFIG_DIR` demonstrates HTTP; append `--stdio` to exercise the CLI bridge. Integration tests use the real official SDK, both transports and the same HTTP-visible histories, while model output in those protocol tests is explicitly a demo. Real DeepSeek verification is recorded separately.

SDK references: [official v2 server](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/server/README.md) and [Fastify adapter](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/middleware/fastify/README.md).
