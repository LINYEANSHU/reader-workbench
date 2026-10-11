## Task 3: 插件 SDK、能力注册及工具权限

**Files:** Create `packages/sdk/src/{manifest,capabilities,plugin-context,index}.ts`；`packages/contracts/src/{models,tools,documents,sessions,runs,artifacts,layout}.ts`；`packages/core/src/plugins/{manager,registry}.ts`；`packages/core/src/tools/{registry,policy}.ts`；`tests/unit/plugins.test.ts`、`tests/unit/tool-policy.test.ts`。Modify 两个包的 exports 和 `packages/contracts/src/index.ts`。

**Interfaces:** Produces `PluginManifest { id:string;version:string;sdkRange:string;entry:string;dependencies:string[];settingsSchema:unknown;permissions:string[] }`；`Plugin { manifest:PluginManifest;activate(ctx:PluginContext):Promise<void>;dispose?():Promise<void> }`；`PluginManager.install(path:string,workspaceId:WorkspaceId):Promise<void>`、`enable(id:string,workspaceId:WorkspaceId):Promise<void>`、`disable(...):Promise<void>`。`PluginContext.register<K extends keyof CapabilityMap>(kind:K,id:string,value:CapabilityMap[K]):()=>void`；`getCapability<K extends keyof CapabilityMap>(kind:K,id:string):CapabilityMap[K]`。

`CapabilityMap` 定义以下可调用契约，落在 `capabilities.ts`；数据类型放 contracts，不倒向依赖 core：

| 能力 | 方法签名及用途 |
| --- | --- |
| ModelProvider | `generate(request:ModelRequest,signal:AbortSignal):AsyncIterable<ModelEvent>`；声明 `ModelCapabilities {vision:boolean;tools:boolean;contextWindow:number;maxOutputTokens:number}` |
| DocumentAdapter | `supports(mime:string,extension:string):boolean`；`parse(input:VersionedFile,signal:AbortSignal):Promise<ParsedDocument>` |
| ViewerProvider | `describe(document:DocumentRecord):ViewerDescriptor`，descriptor 的 kind/moduleKey 由 UI 扩展桥验证 |
| ToolProvider | 提供 `ToolDefinition {name:string;inputSchema:unknown;effect:'read'|'write_artifact'|'write_session'|'external_write';execute(input:unknown,scope:RunScope,signal:AbortSignal):Promise<ToolResult>}` |
| ArtifactExporter | `export(input:ArtifactInput,scope:RunScope,signal:AbortSignal):Promise<ExportedBytes>`，返回 MIME/extension/bytes，不自行任意选择输出路径 |
| MemoryProvider | `summarize(turns:ReadonlyArray<CommittedTurn>,budget:number,signal:AbortSignal):Promise<MemorySummary>`，summary 包含覆盖 turn ID |
| ContextTransform | `transform(input:Readonly<ContextEnvelope>,signal:AbortSignal):Promise<ContextEnvelope>`，修改请求副本且校验来源/作用域 |
| StorageProvider | `open(root:string):Promise<WorkspaceStore>`，WorkspaceStore 包含任务 2/5/6 的事务仓库接口，默认 SQLite 也按此注册 |
| LifecycleHooks | `onEvent(event:LifecycleEvent):Promise<void>`，事件失败可观察、不吞掉其他监听器 |
| UIContribution | `UiContribution {id:string;title:string;kind:'action'|'settings'|'view';actionId?:string;settingsSchema?:unknown;view?:SafeViewDescriptor}` 和 `invokeAction(id:string,scope:ActionScope):Promise<ActionResult>` |
| WorkspaceProvider | `browse(path:string,actor:Actor):Promise<DirectoryEntry[]>`，默认应用目录浏览器 |
| LayoutContribution | 提供 `LayoutPreset {id:string;title:string;tree:LayoutNode}` 以及受验证的布局动作 |
| SelectionAction | `invoke(selection:SelectionContext,scope:ActionScope):Promise<SelectionActionResult>`，默认目标临时栏 |
| CaptureProvider / HotkeyProvider | 描述支持平台/授权/捕获范围和 `CaptureRequest→CaptureResult` / `HotkeyBinding→HotkeyRegistration`；内置浏览器提供者的实现位于任务 12 的前端注册桥 |
| ProcessToolProvider | 提供 `ProcessToolSpec {command:string;args:string[];tool:Omit<ToolDefinition,'execute'>;timeoutMs:number}`，进程执行器在任务 14 实现 |

- [ ] **Step 1: 写插件与权限测试。** 不兼容 SDK、缺依赖、环依赖、重复能力报可识别错误；启用失败回滚自身注册；停用释放监听/动作且不影响其他插件。临时 scope 无法写父消息/摘要、不能调用 external_write；仅用户开启的本次 write_artifact 可写自己输出。通过假的 effect/父 sessionId 或变换后跨工作区引用也不能绕过服务校验。

  `temporary tool execution cannot mutate its parent` 的关键断言：

  ```ts
  expect(deniedToolError.code).toBe('TOOL_SCOPE_DENIED');
  expect(parentAfter).toEqual(parentBefore);
  expect(registryAfterDisable).not.toContain('reader-helper.lookup_term');
  ```

- [ ] **Step 2: Run `npm test -- tests/unit/plugins.test.ts tests/unit/tool-policy.test.ts`。** 预期缺注册/策略实现失败。
- [ ] **Step 3: 实现版本/依赖/生命周期与能力注册。** 已运行任务持有能力 lease，停用阻止新请求并在释放最后 lease 后 dispose；无能力时返回明确错误。ToolRegistry 始终对查库后的 scope 做检查；PluginContext 不提供可写父仓库。UI 扩展走版本化描述桥，前端模块注册和服务端注册分别管理，声明 native 不会自动获得 OS 权限。
- [ ] **Step 4: Run 两测试及 `npm run typecheck`。** 预期通过；所有扩展点有真实注册/获取/释放方法，具体消费者将在对应后续任务接入，任务 14 做逐项消费验收。
- [ ] **Step 5: Commit 信息 `feat: add scoped plugin capabilities and tool policy`。

