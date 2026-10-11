## Task 14: 外部 MCP、Python 进程工具与可安装示例插件

**Files:** Create `packages/core/src/plugins/{external-mcp,process-tools,ui-bridge}.ts`；`apps/server/src/routes/plugins.ts`；`apps/web/src/plugins/{PluginSettings,ContributionView}.tsx`；`plugins/reader-helper/{plugin.json,index.mjs}`、`plugins/python-helper/{plugin.json,index.mjs,tool.py}`；`tests/integration/plugin-extension.test.ts`、`tests/fixtures/mcp-tool-server.mjs`；`docs/plugins.md`。Modify 设置界面及各消费者的 capability lookup。

**Interfaces:** Produces `connectExternalMcp(config:ExternalMcpConfig,workspaceId:WorkspaceId):Promise<ExternalToolConnection>`，config 的 transport 为 stdio/http，command/args 或 url、credentialRef、每工具 effect 的映射；`registerProcessTool(spec:ProcessToolSpec,workspaceId:WorkspaceId):()=>void`；`listUiContributions(workspaceId:WorkspaceId):UiContribution[]`、`invokeUiAction(id:string,scope:ActionScope):Promise<ActionResult>`。插件路径在用户已批准的本地目录/包内，设置按 workspaceId+pluginId 隔离。

- [ ] **Step 1: 写真实扩展测试。** reader-helper 安装后提供“术语解释”工具、“把选区带到临时提问”界面动作和字数设置；执行/修改设置/停用后验证释放。Python stdlib 工具通过真实解释器注册、请求/响应、超时/取消/错误传播；输入有中文和 shell 元字符不得执行 shell。外部 MCP stdio/http 均发现/调用/断连并更新 schema；未声明影响的外部工具默认 external_write，临时请求不能执行，标注 read 后仍不能写父会话。对每类 SDK 扩展至少注册替代实现并验证真实消费者调用，不把 registration-only 当作接入完成。

  `calls a Python tool and refuses an external parent mutation` 的关键断言；Python 示例工具 `word_stats` 对输入 `你好 AI` 计 Unicode 字符数：

  ```ts
  expect(pythonResult.char_count).toBe(5);
  expect(externalWriteError.code).toBe('TOOL_SCOPE_DENIED');
  expect(parentAfter).toEqual(parentBefore);
  expect(contributionsAfterDisable).not.toContain('reader-helper.ask-selection');
  ```

- [ ] **Step 2: Run `npm test -- tests/integration/plugin-extension.test.ts`。** 预期缺桥接及示例失败；缺 Python 记不可用，不让核心启动失败，但 R23 的真实调用必须在可用解释器上补验。
- [ ] **Step 3: 实现连接管理、进程桥和界面桥。** 使用 MCP Client v2；工具名含 server 命名空间，显式 effect 映射受用户插件权限约束。Python 一次调用以独立 argv 运行，stdin 一行 JSON `{version:1,id,tool,input,scope}`，stdout 一行 JSON `{version:1,id,result}` 或 `{version:1,id,error}`，诊断写 stderr；scope 不携带 token/Key，可选只读工作区句柄通过核心服务调用而非父仓库。取消通过已有 process helper 终止进程树。插件 UI 来自安全描述动作/设置/视图，native helper 的 capture/hotkey 能力须明确其安装及授权；内置浏览器 provider 仍是默认。停用不丢在途结果归属。
- [ ] **Step 4: Run 本测试、typecheck，实际从设置安装/启停两个示例。** 预期工具调用、界面动作和 Python 响应均可观察；逐项记录 Model/Document/Viewer/Tool/Exporter/Memory/Context/Storage/Hooks/UI/Workspace/Layout/Selection/Capture/Hotkey/Process 扩展的消费者验证。
- [ ] **Step 5: Commit 信息 `feat: integrate external MCP and Python plugin tools`。

