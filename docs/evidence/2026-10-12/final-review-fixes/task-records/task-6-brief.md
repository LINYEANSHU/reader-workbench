## Task 6: Agent 工具循环、可恢复事件与取消

**Files:** Create `packages/core/src/runs/{service,repository,events,queue,tool-loop}.ts`；`packages/core/src/tools/{executor,builtins}.ts`；`apps/server/src/routes/runs.ts`；`tests/integration/runs.test.ts`。Modify migrations、model/run contracts 和 default registry。

**Interfaces:** Consumes ContextBuilder、ModelProvider、ToolRegistry、SessionRepository、DocumentJobService。Produces `RunService.submit(request:AskRequest,actor:Actor):Promise<{runId:RunId}>`、`get(workspaceId:WorkspaceId,runId:RunId):Promise<RunRecord|DocumentJobRecord>`、`events(workspaceId:WorkspaceId,runId:RunId,afterSeq:number,signal:AbortSignal):AsyncIterable<RunEvent>`、`cancel(workspaceId:WorkspaceId,runId:RunId,actor:Actor):Promise<void>`。`RunRecord` 含 kind:'agent'/workspaceId/sessionId/status/contextRevision/requestId/error；两个 kind 共用 queued/running/completed/failed/cancelled 终态。`RunEvent` 含 runId/workspaceId/seq、scope（`{kind:'agent';sessionId:SessionId}` 或 `{kind:'document';documentId:DocumentId}`）及 event kind `state|progress|context|delta|tool-start|tool-result|citation|artifact|error`。`ToolExecutor.execute(name:string,input:unknown,scope:RunScope,executionId:string,signal:AbortSignal):Promise<ToolResult>`。

RunStorePort 定义 `get(id:RunId):Promise<RunRecord>`、`create(record:RunRecord):Promise<void>`、`appendEvent(event:RunEvent):Promise<void>`、`readEvents(id:RunId,afterSeq:number):Promise<RunEvent[]>`、`setStatus(id:RunId,status:RunStatus,error?:PublicError):Promise<void>`；Core 服务核对调用者与 scope 后使用，PluginContext 不提供该可写仓库。RunStatus 与 PublicError 分别来自 contracts/runs 和 contracts/errors。

- [ ] **Step 1: 写 `runs.test.ts`。** 断言 queued→running→终态且每个事件 seq 单调；同会话串行，不同临时分支可并行。重复 requestId 不追加消息或副作用；断网后 afterSeq 重放无缺口；取消网络/工具/转换全部停止，部分文本标记 cancelled。损坏工具 JSON/schema 和外部写工具不能执行；重启未终态运行标 failed/INTERRUPTED。A 运行途中切 B 后所有事件/消息仍绑定 A。失败/取消/工具异常不改变临时父记录。

  `deduplicates requests and cancels the scoped run` 的关键断言：

  ```ts
  expect(repeatedSubmission.runId).toBe(firstSubmission.runId);
  expect(completedSideEffects).toBe(1);
  expect(cancelledRun.status).toBe('cancelled');
  expect(cancelledRun.workspaceId).toBe(workspaceA.id);
  ```

- [ ] **Step 2: Run `npm test -- tests/integration/runs.test.ts`。** 预期缺运行服务失败。
- [ ] **Step 3: 实现运行服务和路由。** `POST /runs`、`GET /runs/:id`、`GET /runs/:id/events`、`POST /runs/:id/cancel` 全部要求 workspaceId。入队后在获得 session 执行权、开始本次模型请求前固定 ContextEnvelope；后续流式期间不变。默认最多 8 次工具轮转，耗尽时明确失败/需要继续；执行幂等记录以 runId+toolCallId 固定，未知是否完成的副作用禁止自动重放。内置工具调用文档页/块读取、检索和归档历史，不直接访问磁盘。SSE 持久化事件并支持 Last-Event-ID；恢复终态可取最终结果。
- [ ] **Step 4: Run 本测试和 typecheck。** 预期通过；任务失败的堆栈仅限已脱敏诊断，浏览器/外部接口只见标准错误。
- [ ] **Step 5: Commit 信息 `feat: run scoped agents with streaming recovery and cancellation`。

