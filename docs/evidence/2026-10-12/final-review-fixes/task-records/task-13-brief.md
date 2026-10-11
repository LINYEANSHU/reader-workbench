## Task 13: HTTP 契约与同一服务的 MCP Server/stdio 桥

**Files:** Create `apps/server/src/mcp/{server,resources,http}.ts`；`apps/server/src/openapi.ts`；`apps/cli/src/mcp.ts`；`tests/integration/mcp-server.test.ts`；`scripts/http-client.mjs`、`scripts/mcp-client.mjs`；`docs/api.md`、`docs/mcp.md`。Modify app/cli/runtime 注册与 server dependencies。

**Interfaces:** Produces `createMcpServer(services:ReaderServices,actor:Actor):McpServer`；`attachMcpHttp(app:FastifyInstance,services:ReaderServices):Promise<void>`；`runStdioBridge(url:string,token:string,signal:AbortSignal):Promise<void>`。`ReaderServices` 是已实现 WorkspaceService/DocumentService/SessionService/RunService/ArtifactService/PluginManager 的组合引用，所有方法委托原服务而非另建 store。HTTP MCP endpoint 固定 `/mcp`；CLI `mcp --url --token-file` 可读取相同 config-dir 的受保护连接记录；日志只写 stderr。

- [ ] **Step 1: 写真实 SDK 客户端测试。** 独立 HTTP 和 MCP 客户端选择工作区、打开文件、创建主/临时 session、提问获取 runId、读取事件/结果并取消；比较同一 session 在 Web/API/MCP 可见的记录。分别走 Streamable HTTP 与 CLI stdio；无 token/错误 Host/Origin 拒绝，非调用者所属文件不能访问，工具/资源不含 Key。长调用返回 runId 而不阻塞到全部生成完毕。

  `shares HTTP and both MCP transports with the web service` 的关键断言：

  ```ts
  expect(mcpAskResult.structuredContent.runId).toBeTruthy();
  expect(historyFromHttp).toEqual(historyFromMcpResource);
  expect(stdioDocumentResult.structuredContent.documentId).toBe(document.id);
  expect(JSON.stringify(resourceResult)).not.toContain(testKey);
  ```

- [ ] **Step 2: Run `npm test -- tests/integration/mcp-server.test.ts`。** 预期缺 MCP 入口失败。
- [ ] **Step 3: 实现 MCP 与公开契约。** 使用当前官方 v2 `@modelcontextprotocol/server`、`client`、`fastify`，依赖锁定且统一 schema。注册 `list_workspaces`、`select_workspace`、`list_workspace_files`、`open_document`、`read_document_page`、`search_document`、`create_reading_session`、`ask_main`、`ask_temporary`、`get_run`、`cancel_run`、`list_artifacts`、`open_artifact`。资源 URI 使用 `reader://<workspaceId>/documents/<id>/<version>/pages/<page>` 和 sessions/artifacts ID，所有读取经认证。stdio 桥的每项操作转发已运行服务，不能新建独立数据库；API schema 生成文档并校验 HTTP/MCP 入参。连接关闭释放 SDK session/transport。
- [ ] **Step 4: Run 本测试与 typecheck；实际运行两个 scripts。** 预期外部客户端读到同一工作区/会话结果，无遗留端口或进程；SDK 协议模拟模型证据与真实 LLM 证据分开。
- [ ] **Step 5: Commit 信息 `feat: expose reader services through HTTP and MCP`。

