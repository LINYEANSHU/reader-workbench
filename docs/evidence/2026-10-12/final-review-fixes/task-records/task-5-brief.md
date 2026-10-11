## Task 5: 主/临时会话与有来源的动态记忆

**Files:** Create `packages/core/src/sessions/{repository,service,context,memory,history-search}.ts`；`apps/server/src/routes/sessions.ts`；`tests/integration/session-isolation.test.ts`、`tests/unit/context-budget.test.ts`。Modify contracts sessions/models、migration 和 server routes。

**Interfaces:** Produces `SessionService.createMain(workspaceId:WorkspaceId,title:string):Promise<SessionRecord>`、`createTemporary(workspaceId:WorkspaceId,parentMainSessionId:SessionId):Promise<SessionRecord>`、`clearTemporary(workspaceId:WorkspaceId,sessionId:SessionId,actor:Actor):Promise<void>`、`getHistory(workspaceId:WorkspaceId,sessionId:SessionId,cursor?:string):Promise<HistoryPage>`。`SessionRecord {id;workspaceId;kind:'main'|'temporary';parentMainSessionId?:SessionId;revision:number}`。`SessionRepository.completeOwnTurn(scope:RunScope,turn:CompletedTurn):Promise<number>` 为唯一完成轮次/revision 事务写入口；失败/部分输出另存，不计入 CommittedTurn。`ContextBuilder.build(request:AskRequest,signal:AbortSignal):Promise<ContextEnvelope>`；envelope 包含本次 sessionId、mainRevision、documents、immutable messages、sourceRanges、budget 和 summaryCoverage。`MemorySummary {text:string;turnIds:string[];revision:number}`。

SessionStorePort 定义 `getSession(id:SessionId):Promise<SessionRecord>`、`getCommittedTurns(id:SessionId,atRevision?:number):Promise<CommittedTurn[]>`、`completeOwnTurn(scope:RunScope,turn:CompletedTurn):Promise<number>`、`saveOwnSummary(scope:RunScope,summary:MemorySummary):Promise<void>`；写方法先核对 scope.sessionId，不能用读父权限写父记录。仓库所有权测试此阶段用已登记的测试 scope，不等待真实模型/RunService 才验证不变量。

- [ ] **Step 1: 写隔离和容量测试。** 主轮次 A 完成→临时 T1→主 B 完成→临时 T2，断言 T2 有 A/B 和 T1 自己追问，各主轮次只一次；每次临时执行前后主 messages/revision/summary/tool-state 哈希完全一致。主流式未提交轮次不可见；已生成 envelope 不随后续主更新变动。清空一个临时分支不删其他分支。小容量下保留选区、近期轮次、来源摘要和历史读取能力，不删除原记录、不更新父摘要；非法父类型或跨工作区 parent 拒绝。

  `inherits the next committed revision without writing to parent` 的关键断言：

  ```ts
  expect(firstEnvelope.mainRevision).toBe(1);
  expect(nextEnvelope.mainRevision).toBe(2);
  expect(parentAfterTemporaryRequest).toEqual(parentBeforeTemporaryRequest);
  expect(archivedTurnIdsAfterSummary).toEqual(archivedTurnIdsBeforeSummary);
  ```

- [ ] **Step 2: Run `npm test -- tests/integration/session-isolation.test.ts tests/unit/context-budget.test.ts`。** 预期缺仓库/组装实现失败。
- [ ] **Step 3: 实现以上接口和 create/list/history/temporary/clear 路由。** SQLite 事务读已完成轮次及 revision，完整归档、提交后增加 revision；请求副本不共享可变对象。模型预算扣除输出/工具/图像预留，未知 tokenizer 采用保守估计并标明估计。默认 MemoryProvider 使用模型摘要、保存覆盖 turn IDs；测试注入确定性 provider，核心没有 provider 时不伪造回答。临时压缩父材料只写自身/request-local 摘要，历史分页和检索工具仍能取回原文。ContextTransform 后再次验证来源及容量。
- [ ] **Step 4: Run 两测试与 typecheck。** 预期通过，重开数据库后历史和隔离保持；大历史测试检查能查询被摘要覆盖的实际旧轮次。
- [ ] **Step 5: Commit 信息 `feat: isolate temporary conversations with live parent memory`。

