## Task 7: 真实 OpenAI-compatible 接入与能力检查

**Files:** Create `packages/core/src/models/{openai-compatible,sse-parser,settings,demo}.ts`；`apps/server/src/routes/settings.ts`；`tests/integration/model-adapter.test.ts`、`tests/fixtures/openai-streams.ts`。Modify config/credentials/default provider 注册。

**Interfaces:** Produces `OpenAICompatibleProvider` 实现任务 3 的 ModelProvider；`ModelSettings {id:string;baseUrl:string;model:string;credentialRef:string;capabilities:ModelCapabilities;ocrToolId?:string}`；`saveModelSettings(workspaceId:WorkspaceId,settings:ModelSettings,key?:string):Promise<MaskedModelSettings>`、`listModelSettings(workspaceId:WorkspaceId):Promise<MaskedModelSettings[]>`。ModelRequest 含 messages/tools/maxOutputTokens，ModelEvent 的 kind 为 `delta|tool-call|usage|done`；只在完整工具 JSON 收齐后发出 tool-call。ocrToolId 可指定已注册 read 工具，输入已授权的图像/附件引用，返回文字与来源；没有配置且无 vision 时明确 VISION_UNAVAILABLE，不承诺内置 OCR 已安装。

- [ ] **Step 1: 写模拟 HTTP 服务集成测试。** 使用真实 fetch/SSE 传输验证 UTF-8 字节拆分、多行 data、交错工具参数、终止和取消；覆盖 401/429/超限/中断。图片且 vision=false 明确拒绝或走已配置 OCR，无二者时不调用文本模型假装看图。Key 不在响应、日志、ContextEnvelope 或工具结果中；没有 `--demo` 时不能注册演示 provider。

  `reports authentication and image capability errors without secrets` 的关键断言：

  ```ts
  expect(failedRun.error.code).toBe('MODEL_AUTHENTICATION_FAILED');
  expect(visionError.code).toBe('VISION_UNAVAILABLE');
  expect(JSON.stringify(publicEvents)).not.toContain(testKey);
  expect(textOnlyEndpointImageCalls).toBe(0);
  ```

- [ ] **Step 2: Run `npm test -- tests/integration/model-adapter.test.ts`。** 预期缺适配器失败。
- [ ] **Step 3: 实现兼容 Chat Completions 流式适配、设置路由及 provider 注册。** 配置 baseUrl/model/credential source/context/output/vision/tools；保留 baseUrl 路径而不重复 `/v1`。服务端从 credentialRef 读取密钥，设置响应仅 hasKey/masked 值。页面图像最多默认 4 页、单图 4 MiB，总图像 12 MiB，可配置并显示实际发送范围；压缩和预算按 provider 能力。可恢复读取错误与副作用重试分开，禁止默认重放已开始工具写入的整轮。
- [ ] **Step 4: Run 本测试与 typecheck。** 预期通过；本阶段证据标为协议模拟集成验证，真实端点验证由任务 15 单独记录。
- [ ] **Step 5: Commit 信息 `feat: connect configurable streaming LLM providers`。

