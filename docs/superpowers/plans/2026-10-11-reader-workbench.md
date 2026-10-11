# Reader Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建可在 Windows、macOS、Linux 本机启动的阅读 Agent：先选工作区，再同时阅读文件、进行主对话和不回写主记忆的临时追问。

**Architecture:** 使用 npm workspaces 分开管理契约、插件 SDK、核心服务及 CLI/HTTP/Web 三个入口。所有入口调用同一工作区服务和 Agent 内核；每个工作区有独立 SQLite、缓存和输出目录。按依赖顺序实现 15 个可单独验证的任务，随后贯通浏览器、插件与独立 MCP 客户端。

**Tech Stack:** Node.js 24 LTS、TypeScript/ESM、React、Vite、Fastify、Zod、Node 内置 SQLite、PDF.js、LibreOffice；Vitest 与 Playwright。MCP 使用官方 v2 的 server/client/fastify 包；结构化文件导出使用 docx、PptxGenJS；DOM 截图使用 html-to-image，PDF 截图直接使用页面画布。

**Spec:** [已批准的 v0.2 设计规格](../specs/2026-10-11-reader-agent-design.md)。执行者先读规格和本计划；本计划未改变已批准的产品范围。

## Global Constraints

- “macOS、Windows、Linux 使用同一套应用，通过命令行启动。”
- “先选取本机工作区，再浏览并打开其中的文件。”
- “后续 Agent 生成的文档、图片及其他文件全部保存在所属工作区。”
- “临时对话每次提问读取主对话最新记忆，同时保留自己的追问历史；它不回写主对话。”
- “三个工作栏分别提供 50%–200% 的内容缩放，默认 100%”。
- “布局使用可嵌套的水平/垂直分割树描述，三个面板各出现一次。”
- 截图快捷键默认 `Mod+Shift+X`；“快捷键作用域为已获得焦点的工作台页面”。
- `outputs/<session-id>/` 保存生成文件，`imports/` 保存上传文件，`.reader-workbench/` 保存工作区数据库、索引、缓存及截图附件。
- “当前不开展 Android/iOS 平台适配”；“后台全局系统热键不属于纯 Web 快捷键能力”。
- “调用外部程序使用独立参数数组，不拼接 shell 命令。Windows 启动后台程序不弹出额外窗口。”
- “没有真实 API Key 时不能把模拟回答作为真实 LLM 验收证据。”
- “不能把后续接口预留替代本规格明确要求的可运行能力。”

## Review Focus

1. 中文、空格、UNC/盘符路径及工作区内链接：保留原件和路径，拒绝越界链接及穿越；由任务 2 的实际文件测试覆盖。
2. 已选工作区 A 的运行未完成就切换到 B：上下文、截图和输出仍归属 A；由任务 6、8、12 的切换测试覆盖。
3. 主对话流式输出途中临时追问，以及取消/失败/压缩后的再次追问：只继承完成轮次，父记录完全不变；由任务 5–7 覆盖。
4. 不同栏缩放、高 DPI、跨页选字及滚动后框选：定位和截图必须来自实际区域，布局不能被窗口方向重置；由任务 10–12 的浏览器测试覆盖。
5. 大文档、扫描页、无转换器/视觉能力、缺字体和失效远程图片：仍可阅读可见页面，并明确说明不能解析或截图的内容；由任务 4、7、9、12、15 覆盖。

---

## 文件与依赖结构

这是一个共享状态和契约的产品，采用一份顺序计划；文档、运行、界面和外部调用不能各自建设另一份会话系统。任务 1–8 交付可用服务，9–12 交付完整阅读界面，13–14 贯通外部扩展，15 做发行与验收；这些阶段都属于本次交付。

| 路径 | 职责 |
| --- | --- |
| `packages/contracts/src/` | ID、来源、会话、运行、布局、HTTP schema；不依赖核心或 UI |
| `packages/sdk/src/` | 插件 manifest、能力契约、注册/释放接口；只依赖 contracts |
| `packages/core/src/runtime/` | 配置、凭据引用、认证辅助、子进程及依赖诊断 |
| `packages/core/src/workspaces/`、`storage/` | 目录作用域、数据库迁移与工作区生命周期 |
| `packages/core/src/plugins/`、`tools/` | 插件注册表、权限判断、工具执行及幂等 |
| `packages/core/src/documents/`、`artifacts/` | 文件版本、解析、转换、检索、文件导出 |
| `packages/core/src/sessions/`、`runs/`、`models/` | 主/临时记录、记忆、上下文、运行和模型适配 |
| `apps/server/src/` | Fastify、认证、HTTP/SSE、MCP；只调用服务 |
| `apps/web/src/` | 工作区入口、文档和对话、布局、选区、截图与设置 |
| `apps/cli/src/`、`bin/reader-workbench.mjs` | `web` / `doctor` / `mcp`，定位发行资源 |
| `plugins/reader-helper/`、`plugins/python-helper/` | 可安装的工具/界面示例，以及 Python 进程工具示例 |
| `tests/unit/`、`tests/integration/`、`tests/e2e/` | 业务不变量、真实文件/HTTP/进程验证和浏览器验证 |
| `tests/fixtures/`、`scripts/`、`docs/` | 可重复样例、验收入口、说明和证据 |

根级 `package.json` 按 contracts→sdk→core→server→web→cli 排列 workspaces；各包各有 `package.json` 和 `tsconfig.json`。服务端使用 NodeNext 和 `.js` 相对导入；前端使用 Bundler 解析。依赖安装时写精确版本和 `package-lock.json`，以后使用 `npm ci`，不在说明中依赖浮动 `latest`。

根命令固定为：`npm run build`、`npm run typecheck`、`npm test -- <file>`（Vitest）、`npm run test:e2e -- <file>`（Playwright）、`npm start -- <CLI arguments>`、`npm run test:live -- <arguments>`。CLI bin 名固定为 `reader-workbench`，安装前可用 `npm start -- web --no-open`。

发行采用一个 `reader-workbench` 包，不要求发布六个内部 workspace 包：`scripts/build.mjs` 使用 esbuild 将 CLI/server/core/contracts 的内部导入合并为 `dist/cli.mjs`，第三方运行库保持 external 并列入根 dependencies；前端由 Vite 输出 `apps/web/dist/`。SDK 的内部契约也合并到 `dist/sdk.mjs`，使用 rollup-plugin-dts 生成不依赖私有包名的 `dist/sdk.d.ts`，通过 `reader-workbench/sdk` 导出。bin 导入 `dist/cli.mjs`，资源从发行包自身位置定位。任务 1 只为有源文件的包设置 build/typecheck 引用；任务 3/9 才分别启用 SDK/Web 构建，不让空目录导致假失败。

所有 HTTP 路由均在 `/api/v1` 下；本文后续路由简写省略此前缀。实体按 workspaceId 鉴权，SSE 使用已认证 fetch 流；浏览器引导码置于 URL fragment，经一次兑换立即清除，禁止放入查询日志或 Referer。

在用户批准执行方法后，先使用 using-git-worktrees 建立隔离工作区。所有代码任务在该工作区进行；复制的是已提交规格/计划，不搬动用户文件。每个任务从新测试失败开始，完成相关测试及类型检查后只提交本任务文件。下面的提交命令在执行工作区内运行；出现 Git 所有权问题时只对当前仓库使用单次 `-c safe.directory=<已核对路径>`。

## 共享名称与数据约定

- `WorkspaceId`、`DocumentId`、`SessionId`、`RunId`、`ArtifactId`、`AttachmentId` 是不同的字符串 ID 类型；`DocumentVersion` 是 SHA-256 字符串。任何所属工作区的记录都带 `workspaceId`。
- `Actor = { callerId: string; transport: 'web'|'http'|'mcp'|'internal' }`；`RunScope = { actor: Actor; workspaceId: WorkspaceId; sessionId: SessionId; runId: RunId; allowArtifactWrites: boolean }`。服务查库验证归属，不能信任调用者传来的 session kind 或父 ID。
- `DocumentRef = { workspaceId: WorkspaceId; documentId: DocumentId; version: DocumentVersion }`；`SourceAnchor = DocumentRef & { location: PageAnchor | BlockAnchor }`。`PageAnchor = { kind:'page'; page:number; rect?:[number,number,number,number] }`，页码从 1 开始，矩形为左上原点的归一化 x/y/宽/高；`BlockAnchor = { kind:'block'; blockId:string; start:number; end:number }`，偏移为 UTF-16。
- `SelectionContext = { text:string; anchors:SourceAnchor[] }`；`Attachment = { id:AttachmentId; workspaceId:WorkspaceId; sessionId:SessionId; mime:string; sha256:string; anchors:SourceAnchor[]; width:number; height:number }`。跨页保留多个 anchor，不伪造页码。
- `AskRequest = { workspaceId:WorkspaceId; sessionId:SessionId; question:string; documents:DocumentRef[]; selection?:SelectionContext; attachmentIds:AttachmentId[]; providerId:string; requestId:string; allowArtifactWrites:boolean }`。临时默认 `allowArtifactWrites=false`；用户明确选择生成文件动作时可开启本次自己的输出权限。
- API 成功返回实体或 `{ runId }`；失败返回 `{ error:{ code:string; message:string; retryable:boolean } }`，不返回堆栈/凭据。提交问题返回 HTTP 202，重复 requestId 返回原 runId。
- `WorkspaceStore` 的公共接口定义在 `packages/contracts/src/storage.ts`，不能让 SDK 倒向导入 core。任务 2 先定义 workspaceId 与 `close():Promise<void>`；任务 4 加 documents、任务 5 加 sessions、任务 6 加 runs、任务 8 加 artifacts Port，同步定义到 contracts 并实现于 core。各任务维护 StorageProvider 契约测试；不会在前序任务引用尚未定义的 Port。数据库内部 SQL/句柄不交给 PluginContext。
- 标准错误码包括 `WORKSPACE_REQUIRED`、`PATH_OUTSIDE_WORKSPACE`、`TOOL_SCOPE_DENIED`、`MODEL_AUTHENTICATION_FAILED`、`VISION_UNAVAILABLE`；运行中错误通过 RunRecord/error 事件表达，而不把 HTTP 202 当作模型完成。
- 所有服务可接收 `AbortSignal` 的长任务均检查取消；测试目录使用临时工作区，禁止将生产工作区当作清理目标。

## Task 1: 可启动的认证服务与 CLI 基座

**Files:** Create 根级 `package.json`、`package-lock.json`、`tsconfig.json`、`vitest.config.ts`、`.gitignore`；上述六个 workspace 的 package/tsconfig；`scripts/build.mjs`；`packages/contracts/src/{ids,errors,runtime,index}.ts`；`packages/core/src/runtime/{config,credentials,doctor}.ts`；`apps/server/src/{app,auth,index}.ts`；`apps/cli/src/{index,web,doctor}.ts`；`bin/reader-workbench.mjs`；`tests/integration/runtime.test.ts`。仅此任务增加构建配置，不另开纯脚手架任务。

**Interfaces:** Produces `RuntimeConfig { host:string; port:number; configDir:string; noOpen:boolean; workspace?:string; demo:boolean }`；`loadRuntimeConfig(args:string[]):Promise<RuntimeConfig>`；`startServer(config:RuntimeConfig):Promise<{url:string;close():Promise<void>}>`；`doctor(config:RuntimeConfig):Promise<DoctorReport>`，报告包含 Node、LibreOffice 检出路径/版本和错误码。凭据库 `setSecret(ref:string,value:string):Promise<void>` / `getSecret(ref:string):Promise<string>` / `hasSecret(ref:string):Promise<boolean>`，永不出现在普通 API DTO。

- [ ] **Step 1: 创建 `runtime.test.ts` 并落实测试运行配置。** 断言默认 host 为 `127.0.0.1`，CLI `--no-open` 真正可启动；无令牌配置 API 返回 401；只允许正确 Origin/Host；启动的一次性浏览器引导码兑换 HttpOnly/SameSite cookie 后立即失效，随后跳转干净 URL；占用端口返回可理解错误。日志和配置查询不能含测试 Key。全局连接/凭据文件与工作区文件分离，文件权限收紧。

  核心断言写入名为 `starts locally without opening and protects configuration` 的测试：

  ```ts
  await expect(loadRuntimeConfig(['web', '--no-open'])).resolves.toMatchObject({
    host: '127.0.0.1', port: 4317, noOpen: true,
  });
  expect(unauthenticatedConfiguration.statusCode).toBe(401);
  expect(JSON.stringify(maskedConfiguration)).not.toContain(testKey);
  ```

- [ ] **Step 2: Run `npm test -- tests/integration/runtime.test.ts`。** 预期因尚无启动/认证实现失败，而不是因为测试运行器或依赖无法启动。
- [ ] **Step 3: 实现以上入口及 `GET /config`。** CLI 使用默认端口 4317，完整支持 `web --host --port --config-dir --workspace --no-open --demo` 和 `doctor`；默认配置目录由平台用户配置目录决定。浏览器打开使用跨平台库，后台进程隐藏；health 只提供非敏感存活状态。外部访问使用单独的 bearer token，cookie 请求检查来源；日志启用凭据字段脱敏。初始根页面只明确提示后续工作区入口，不宣称已能阅读。
- [ ] **Step 4: Run `npm test -- tests/integration/runtime.test.ts`、`npm run typecheck`、`npm run build`。** 预期全部通过；实际启动/停止 CLI 子进程，确认监听和关闭，缺 LibreOffice 时 doctor 返回不可用能力而不阻止服务启动。
- [ ] **Step 5: Commit 本任务 Files，信息 `feat: bootstrap authenticated reader runtime`。** 不提交配置中的 token/Key、运行数据库或 node_modules。

## Task 2: 工作区选择、真实文件边界与独立存储

**Files:** Create `packages/contracts/src/{workspaces,ui-state,storage}.ts`；`packages/core/src/workspaces/{service,path-guard,directory-browser}.ts`；`packages/core/src/storage/{database,migrations,workspace-store}.ts`；`apps/server/src/routes/{workspaces,ui-state}.ts`；`tests/integration/workspaces.test.ts`。Modify `apps/server/src/app.ts`、`packages/contracts/src/index.ts`。

**Interfaces:** Produces `Workspace { id:WorkspaceId; root:string; name:string }`；`WorkspaceService.select(root:string,actor:Actor):Promise<Workspace>`、`listRecent(actor:Actor):Promise<Workspace[]>`、`browseDirectories(path:string,actor:Actor):Promise<DirectoryEntry[]>`、`listFiles(id:WorkspaceId,relativePath:string):Promise<FileEntry[]>`；`resolvePath(id:WorkspaceId,relativePath:string,mode:'read'|'create'):Promise<string>`；`storeFor(id:WorkspaceId):Promise<WorkspaceStore>`。`saveUiState(workspaceId:WorkspaceId,clientId:string,state:UiState):Promise<void>` / `getUiState(workspaceId:WorkspaceId,clientId:string):Promise<UiState|null>`；UiState 后续任务扩充字段。

- [ ] **Step 1: 写 `workspaces.test.ts`。** 未选择工作区时 storeFor 返回 WORKSPACE_REQUIRED（建会话/导入的完整门禁在任务 9 贯通）；选真实空目录后数据库只位于其 `.reader-workbench/state.sqlite`。读有中文/空格的源文件前后字节相同；输入 `../`、绝对文件路径、越界 symlink/junction、输出父链接和受保护凭据路径均被拒绝。测试 `path.win32` 的盘符/UNC 边界，当前平台实际测试链接。只读目录/不存在目录明确报错；A/B 数据和 clientId 的 UI 状态隔离。

  `rejects traversal without changing originals` 的关键断言：

  ```ts
  await expect(resolvePath(workspace.id, '../outside.txt', 'read'))
    .rejects.toMatchObject({ code: 'PATH_OUTSIDE_WORKSPACE' });
  expect(sourceHashAfter).toBe(sourceHashBefore);
  expect(uiStateFromB).toBeNull();
  ```

- [ ] **Step 2: Run `npm test -- tests/integration/workspaces.test.ts`。** 预期缺工作区服务失败。
- [ ] **Step 3: 实现接口及 `/api/v1/workspaces`（GET/POST）、`/directories`（GET）、`/workspaces/:id/files`（GET）、`/ui-state/:clientId`（GET/PUT）。** Directory browser 只列目录元数据，内容读取在确认工作区后才允许。数据库使用参数化 SQL、迁移事务、外键；最近列表只保存在全局配置。输入路径先解析、realpath 检查边界，创建文件采用独占创建并检查父路径；禁止暴露内部数据库/凭据为任意下载。关闭/切换 UI 不释放仍有运行引用的工作区 store。
- [ ] **Step 4: Run 本测试和 `npm run typecheck`。** 预期通过；重开 A 的数据库得到原状态，B 不含 A 记录，源文件哈希未变。平台链接权限不足必须记为未测，不以跳过冒充通过。
- [ ] **Step 5: Commit 信息 `feat: scope files and persistence to selected workspaces`。

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

## Task 4: Markdown/PDF/Office 版本化解析与检索

**Files:** Create `packages/core/src/documents/{service,jobs,versions,index,markdown,pdf,office,notes,text,image,binary}.ts`；`packages/core/src/runtime/process.ts`；`apps/server/src/routes/documents.ts`；`tests/integration/documents.test.ts`；`tests/fixtures/{reader.md,reader.pdf,reader.docx,reader.pptx,reader.doc,reader.ppt,scan.pdf,broken.pdf}`、`tests/fixtures/assets/diagram.png`、`tests/fixtures/manifest.json`。Modify app routes、doctor、registry 默认能力、contracts documents/runs/storage 及 migrations。

**Interfaces:** Consumes WorkspaceService/DocumentAdapter。Produces `DocumentService.open(workspaceId:WorkspaceId,relativePath:string,signal:AbortSignal):Promise<DocumentRecord>`、`import(workspaceId:WorkspaceId,name:string,bytes:Uint8Array,signal:AbortSignal):Promise<DocumentRecord>`、`get(ref:DocumentRef):Promise<DocumentRecord>`、`waitReady(ref:DocumentRef,signal:AbortSignal):Promise<DocumentRecord>`、`readPage(ref:DocumentRef,page:number):Promise<DocumentPage>`、`search(ref:DocumentRef,query:string,limit:number):Promise<SearchHit[]>`、`readBlock(ref:DocumentRef,blockId:string):Promise<DocumentBlock>`。`DocumentRecord` 含 id/workspaceId/relativePath/version/mime/viewer/parseState/pageCount/processingRunId；parseState 为 queued/converting/indexing/ready/failed/cancelled。`ParsedDocument` 含 pages/blocks/warnings；`DocumentBlock` 含 id/text/anchor。`DocumentJobService.get(workspaceId:WorkspaceId,runId:RunId):Promise<DocumentJobRecord>` / `cancel(workspaceId:WorkspaceId,runId:RunId):Promise<void>`；DocumentJobRecord 含 id/kind:'document'/workspaceId/documentId/status/error。`runProcess(command:string,args:string[],signal:AbortSignal,timeoutMs:number):Promise<ProcessResult>`；`convertOffice(input:VersionedFile,signal:AbortSignal):Promise<string>` 返回工作区缓存 PDF 路径。

DocumentJobService 同时实现 `events(workspaceId:WorkspaceId,runId:RunId,afterSeq:number,signal:AbortSignal):AsyncIterable<RunEvent>`，持久化 state/progress/error 事件；任务 6 可直接委托。纯文本有 block 预览，PNG/JPEG/WebP 有图像预览；未知二进制返回明确 fallback descriptor/元数据/下载，不能将其标为已读懂正文。所有测试在读取页面前先 waitReady。

- [ ] **Step 1: 写实际文件测试。** 四类样例包含中文、图片、表格和公式，旧 DOC/PPT 必须由真实转换器验证。源哈希不变；更新源后产生新 version，旧引用仍可读。缺 LibreOffice、坏/加密 PDF、无文本扫描页均明确状态；取消/超时终止子进程。检索能找到中文短词和 `RI`，参数/FTS 特殊符号不变成 SQL/检索指令。记录样例出处和生成方法，不用改后缀假冒旧格式。

  `reads office pages and keeps versioned originals` 的关键断言：

  ```ts
  expect((await documents.waitReady(officeRef, signal)).pageCount).toBeGreaterThan(0);
  expect(sourceHashAfter).toBe(sourceHashBefore);
  expect(updatedRecord.version).not.toBe(originalRecord.version);
  expect((await documents.readPage(originalRef, 1)).text).toContain('RI');
  ```

- [ ] **Step 2: Run `npm test -- tests/integration/documents.test.ts`。** 预期因解析服务缺失失败；先区分测试依赖缺失和真正业务断言。需要准备本机 LibreOffice 时记录安装/版本，禁止将模拟进程认作 Office 验收。
- [ ] **Step 3: 实现文档与转换接口及路由。** `POST /workspaces/:id/documents/open`、`POST /workspaces/:id/documents/import`、`GET /workspaces/:id/documents`、`GET /documents/:id/versions/:version`（处理状态）、`GET /documents/:id/versions/:version/{content,preview,pages/:page,blocks/:blockId,search}`。open/import 在读取版本/登记后返回 processingRunId，解析/转换异步进行；任务 6 的统一 run 查询/事件/取消对 document kind 委托 DocumentJobService，不能让 MCP 打开 Office 阻塞至转换结束。任务 4 在数据库保存处理状态/进度和取消结果，waitReady 只供测试/内部需要完成内容时等待。保存 immutable 源版本及解析结果于工作区缓存，任务都带 workspaceId；相对 Markdown 资源按来源解析并授权。PDF.js 文本解析与页图渲染分开，用 `@napi-rs/canvas` 支持服务器页面图像，浏览器 worker 单独打包。LibreOffice 独立 profile/目录、转换队列并发 1、默认超时 120 秒；按源哈希/引擎版本/配置缓存；`.pptx` 备注从 ZIP/XML 提取，不能对应页时明确标记。全文索引用 SQLite FTS5 trigram，少于 3 字符用参数化 LIKE 补充；文件全部按页/块可读取。
- [ ] **Step 4: Run 本测试、typecheck；渲染检查四类样例。** 预期真实 DOC/DOCX/PPT/PPTX→PDF 均成功、扫描 PDF 可见；版式差异记录到测试报告。原件转换前后 SHA-256 一致，多个版本不串缓存。
- [ ] **Step 5: Commit 信息 `feat: read and index versioned workspace documents`，仅加入许可明确的样例和 manifest。

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

## Task 8: 工作区输出及 Markdown/Word/PPT/PDF 导出

**Files:** Create `packages/core/src/artifacts/{service,atomic-write,markdown,docx,pptx,pdf}.ts`；`apps/server/src/routes/artifacts.ts`；`tests/integration/artifacts.test.ts`。Modify ToolRegistry 内置生成工具、contracts artifacts 和 migrations。

**Interfaces:** Produces `ArtifactService.create(input:ArtifactInput,scope:RunScope,signal:AbortSignal):Promise<ArtifactRecord>`、`list(workspaceId:WorkspaceId,sessionId?:SessionId):Promise<ArtifactRecord[]>`、`open(workspaceId:WorkspaceId,id:ArtifactId):Promise<DocumentRecord>`。`ArtifactInput {format:'md'|'txt'|'docx'|'pptx'|'pdf'|'binary';name:string;blocks:ContentBlock[];sourceAnchors:SourceAnchor[];coverage?:Coverage;bytes?:Uint8Array;mime?:string}`；ContentBlock 支持 heading/paragraph/list/table/image/formula，Coverage 含完整/部分状态与源块范围；ArtifactRecord 带 workspaceId/sessionId/runId/relativePath/mime/sha256/sourceAnchors/coverage。

- [ ] **Step 1: 写真实输出测试。** 每种格式有新文件且重新由 DocumentService 打开；输出位于 `outputs/<session-id>/`，名称冲突生成唯一新名，失败不发布 Artifact，原件哈希不变。A 开始后 UI 切 B，输出仍在 A。临时输出仅自己目录，父消息/附件不变；越界输出目录和未授权写被拒绝。部分翻译元数据和阅读件明确“部分”，不能标全文完成。

  `reopens generated files inside the original run workspace` 的关键断言：

  ```ts
  expect(artifact.workspaceId).toBe(workspaceA.id);
  expect(artifact.relativePath.startsWith(`outputs/${scope.sessionId}/`)).toBe(true);
  expect((await documents.waitReady(reopenedRef, signal)).parseState).toBe('ready');
  expect(sourceHashAfter).toBe(sourceHashBefore);
  ```

- [ ] **Step 2: Run `npm test -- tests/integration/artifacts.test.ts`。** 预期缺导出服务失败。
- [ ] **Step 3: 实现新文件独占写入、成功校验/登记及路由。** 导出器返回 bytes 后由服务选择安全路径，文件写入/哈希/数据库登记完成才发 artifact 事件；中断留下的中间文件不能显示成功。docx/PptxGenJS 处理结构化文本、表格、图片；公式优先渲染图片并保留源表达式，格式损失写 warnings。PDF 通过工作区中间 DOCX→LibreOffice PDF；缺依赖明确错误。生成工具与其他二进制文件共用安全保存机制，未知预览类型仍可下载。`POST /artifacts`、`GET /artifacts`、`GET /artifacts/:id/download`、`POST /artifacts/:id/open` 都验证 scope。
- [ ] **Step 4: Run 本测试、typecheck，实际渲染生成 DOCX/PPTX/PDF。** 预期成功重开，源关系可查；转换与文件提交取消的失败记录无“已保存”状态。
- [ ] **Step 5: Commit 信息 `feat: save and reopen generated workspace artifacts`。

## Task 9: 工作区入口、文件预览与双对话界面

**Files:** Create `apps/web/{index.html,vite.config.ts}`；`apps/web/src/{main,App}.tsx`；`apps/web/src/api/{client,events}.ts`；`apps/web/src/workspaces/{WorkspacePicker,WorkspaceSidebar}.tsx`；`apps/web/src/workbench/{Workbench,DocumentPane,ChatPane,Composer,FileTabs,SettingsDialog,CitationLink}.tsx`；`apps/web/src/documents/{MarkdownViewer,PdfViewer,ImageViewer,FallbackViewer}.tsx`；`apps/web/src/styles/{tokens,workbench,viewers}.css`；`playwright.config.ts`；`tests/e2e/reading.spec.ts`。Modify server static-file 服务及 npm scripts。

**Interfaces:** Consumes 已有 HTTP/SSE。Produces `ApiClient`（各服务的类型化 HTTP 方法）、`subscribeRun(runId:RunId,workspaceId:WorkspaceId,afterSeq:number,onEvent:(event:RunEvent)=>void,signal:AbortSignal):Promise<void>`；`ViewerHandle {navigate(anchor:SourceAnchor):Promise<void>;getSelection():SelectionContext|null;capture(rect:ViewportRect):Promise<CaptureResult>}`；`WorkbenchState {workspaceId:WorkspaceId;mainSessionId:SessionId|null;temporarySessionId:SessionId|null;tabs:DocumentRef[];activeTab:DocumentRef|null}`；`openReference(anchor:SourceAnchor):Promise<void>`。ViewportRect 为 CSS 视口像素矩形，CaptureResult 含 PNG Blob/width/height/anchors。

- [ ] **Step 1: 写 `reading.spec.ts`。** 无工作区时显示选择入口且不能打开文件/发送问题；选择实际 fixture 目录后，点击目录树直接打开原件。PDF/Office 有 canvas 与可选文字层，MD 有标题/表格/公式/资源图，扫描页仍可见。主/临时同时流式显示；临时切换/清空不改变主滚动位置。打开源引用跳到正确版本/页/块，多标签恢复位置；刷新或重新连接不重复发问题。Markdown 中脚本、javascript 链接与资源越界不能执行/读取；缺转换器/能力显示真实状态。

  `requires a workspace and reads with separate conversations` 的关键断言（工作栏使用对应可访问 region 名）：

  ```ts
  await expect(page.getByRole('button', { name: '选择工作区' })).toBeVisible();
  await expect(page.getByRole('region', { name: '文件' })).toContainText('RI');
  await expect(page.getByRole('region', { name: '临时对话' })).toContainText('解释');
  expect(mainHistoryAfterTemporary).toEqual(mainHistoryBeforeTemporary);
  ```

- [ ] **Step 2: Run `npm run test:e2e -- tests/e2e/reading.spec.ts`。** 预期缺界面或交互失败，先保证测试能启动服务及浏览器。
- [ ] **Step 3: 实现工作台和设置。** 先实际打开官方 Harness 页面并保存参考截图，再确定主题细节；采用紧凑路径工具栏、可折叠工作区/会话侧栏、文件标签和两个独立 composer。字体使用系统中文字体栈，页面资源无需外部 CDN。React Markdown+remark-gfm/remark-math+KaTeX，不执行 raw HTML；图片通过授权文档资源 API，消息/插件视图同样安全处理。PDF.js 的 canvas/TextLayer/worker 来自同一锁定版本；取消离开页面的 render task，按可见页懒加载。设置包含模型连接、输出相对目录、插件以及后续快捷键；显示上下文版本/摘要范围和 demo 标识。缺配置时真实提示配置模型，不自动使用演示回答。
- [ ] **Step 4: Run 本 e2e、typecheck、build，并实际查看 MD/PDF/Word/PPT 页面。** 预期浏览器可阅读和对话；保存官方参考与本应用截图的差异记录，静态元素和文本层都检查。此阶段固定三列，任务 10 替换为自由布局。
- [ ] **Step 5: Commit 信息 `feat: build workspace-first document and conversation workbench`。

## Task 10: 自由分割树、三栏排序与独立内容缩放

**Files:** Create `apps/web/src/layout/{tree,presets,state}.ts`、`apps/web/src/layout/{SplitTree,PaneHeader,LayoutControls}.tsx`；`tests/unit/layout.test.ts`、`tests/e2e/layout.spec.ts`。Modify contracts layout/ui-state、Workbench、DocumentPane、ChatPane 和 styles。

**Interfaces:** Produces `PaneId='document'|'main'|'temporary'`；`LayoutNode={kind:'pane';pane:PaneId}|{kind:'split';id:string;direction:'horizontal'|'vertical';ratio:number;first:LayoutNode;second:LayoutNode}`；`validateLayout(tree:LayoutNode):boolean`；`movePane(tree:LayoutNode,pane:PaneId,target:PaneId,placement:'before'|'after'|'above'|'below'):LayoutNode`；`setSplitRatio(tree:LayoutNode,splitId:string,ratio:number):LayoutNode`。`PaneState {zoomPercent:number;collapsed:boolean}`；UiState 含 layout/panes/tabs/readingPositions/hotkeys/sidebarCollapsed；每个 clientId 独立保存。`setPaneZoom(pane:PaneId,zoomPercent:number):void` 只修改指定栏。

- [ ] **Step 1: 写布局单元与浏览器测试。** 六种排列均只出现每栏一次；三列、三行、四个混合预设和拖动重新分割都可用。分隔线同时验证左右/上下拖动；宽/窄窗口下纵向布局保持。三栏设 75%/125%/175%，断言正文分别改变、其他栏和浏览器 devicePixelRatio 不变，标题/输入操作仍可用；超出 50–200 拒绝/限制。刷新、切工作区、不同 clientId 保持正确状态；窄空间只增加滚动或用户折叠，不重写分割树。

  `zooms each pane while preserving a user-selected vertical layout` 的关键断言；glyph 高度用同一无换行词的 Range 实际测量：

  ```ts
  expect(documentGlyphAfter.height / documentGlyphBefore.height).toBeCloseTo(0.75, 1);
  expect(mainGlyphAfter.height / mainGlyphBefore.height).toBeCloseTo(1.25, 1);
  expect(temporaryGlyphAfter.height / temporaryGlyphBefore.height).toBeCloseTo(1.75, 1);
  expect(layoutAfterNarrowResize).toEqual(selectedVerticalLayout);
  ```

- [ ] **Step 2: Run `npm test -- tests/unit/layout.test.ts` 和 `npm run test:e2e -- tests/e2e/layout.spec.ts`。** 预期自由布局及缩放断言失败。
- [ ] **Step 3: 实现以上接口与控件。** 四个混合预设为左右主分割、上下主分割及其镜像；拖 pane 标题、键盘/菜单移动都走 movePane。split ratio 范围 0.1–0.9，最小阅读尺寸用容器滚动处理。每栏默认 100%，选择器支持 50/75/100/125/150/175/200，增减步长 10、恢复 100；支持范围内自定义数值。PDF 重渲染按栏 zoom×DPR，MD 和聊天用受控内容 scale 容器并同步布局尺寸，缩放不作用于 header/composer。布局预设从 SDK LayoutContribution 读取并校验唯一性。
- [ ] **Step 4: Run 两测试、typecheck；查看横、纵及混合布局截图。** 预期通过，逐个验证三栏的文字/代码/公式/图片内容缩放，保存宽与窄窗口证据。
- [ ] **Step 5: Commit 信息 `feat: support independent pane zoom and arbitrary split layouts`。

## Task 11: 文本选区、右键快捷询问与来源跳转

**Files:** Create `apps/web/src/selection/{anchors,selection}.ts`、`apps/web/src/selection/{SelectionMenu,SelectionPreview}.tsx`；`tests/unit/selection.test.ts`、`tests/e2e/selection.spec.ts`。Modify MarkdownViewer/PdfViewer/Composer/CitationLink 及内置 SelectionAction 注册。

**Interfaces:** Produces `readDocumentSelection(root:HTMLElement,ref:DocumentRef):SelectionContext|null`；`toPageAnchor(clientRect:DOMRect,pageRect:DOMRect,page:number,ref:DocumentRef):SourceAnchor`；`askSelection(selection:SelectionContext,mode:'immediate'|'edit'):Promise<void>`。DOM 每个块/页带版本化 anchor 数据；不存在当前临时分支时调用 SessionService.createTemporary，绝不改主 sessionId。

- [ ] **Step 1: 写真实鼠标选字测试。** 在 MD/PDF/Word/PPT 的文字层左键拖选、右键“询问 AI”，临时栏出现用户引用和回答，主历史/revision/滚动不变。跨 PDF 两页产生两个 anchor；75%/175%、滚动和混合布局后仍定位正确。编辑模式只把引用放临时 composer，未提交不发 API；无选区和输入框内右键保留普通菜单。点击回复引用返回指定旧 version，源文件更新不跳错页。

  `asks from a cross-page selection only in the temporary pane` 的关键断言：

  ```ts
  await page.getByRole('menuitem', { name: '询问 AI', exact: true }).click();
  expect(selection.anchors.map(a => a.location.kind === 'page' && a.location.page))
    .toEqual([1, 2]);
  expect(parentAfter).toEqual(parentBefore);
  ```

- [ ] **Step 2: Run `npm test -- tests/unit/selection.test.ts`、`npm run test:e2e -- tests/e2e/selection.spec.ts`。** 预期选区动作缺失失败。
- [ ] **Step 3: 实现读取 Range、上下文菜单和快捷提问。** 文档有效选区才 preventDefault；页面坐标归一化使用实际 bounding rect，MD 从 DOM 块记录与 UTF-16 偏移映射。菜单保留“询问 AI”/“带选区编辑问题”准确文案；默认问题解释所选内容，临时回答软目标 100–300 中文字符，通过 prompt/provider 输出上限而非硬截断。SelectionAction 由 SDK 注册，返回目标验证为当前 workspace 临时栏。
- [ ] **Step 4: Run 两测试和 typecheck。** 预期通过；实际查看选区菜单与跨页引用截图，并再次核对父会话状态哈希。
- [ ] **Step 5: Commit 信息 `feat: ask temporary AI from anchored document selections`。

## Task 12: 可编辑截图快捷键与两种捕获入口

**Files:** Create `apps/web/src/capture/{hotkeys,coordinates,pdf-capture,dom-capture,screen-capture,providers}.ts`、`apps/web/src/capture/{CaptureOverlay,CapturePreview,HotkeySettings}.tsx`；`packages/core/src/documents/attachments.ts`；`apps/server/src/routes/attachments.ts`；`tests/unit/hotkeys.test.ts`、`tests/e2e/capture.spec.ts`、`tests/integration/attachments.test.ts`。Modify UiState、viewers、temporary Composer、settings 和 SDK browser 注册桥。

**Interfaces:** Produces `validateHotkey(binding:string,existing:HotkeyBinding[]):HotkeyValidation`；`captureDocument(viewer:ViewerHandle,rect:ViewportRect,signal:AbortSignal):Promise<CaptureResult>`；`captureScreen(signal:AbortSignal):Promise<CaptureResult>`；`AttachmentService.save(scope:ActionScope,blob:Uint8Array,metadata:CaptureMetadata):Promise<Attachment>`，ActionScope 包含 actor/workspaceId/sessionId；CaptureMetadata 含 width/height/anchors/captureKind。`POST /attachments` 在临时 session 的已验证作用域保存，`GET /attachments/:id` 只返回所属文件。

- [ ] **Step 1: 写快捷键/附件/浏览器测试。** 默认 `Mod+Shift+X` 和替换键在页面焦点有效；重复/保留键有错误反馈；按钮与快捷键行为相同。PDF、MD、Office 在 75%/175%、DPR=1/2、跨页和滚动后截图包含 fixture 标记的真实像素，截图不包含 selection overlay；Esc 不上传且保留问题草稿。PNG 只落所属 `.reader-workbench/attachments/<temporary-id>/`，A 捕获后切 B 不改变归属；主会话不变。缺 vision/OCR 明确拒绝假回答；屏幕授权拒绝/取消停止模式和全部 tracks。CORS 资源无法捕获时说明失败，不保存空白为成功。

  `captures actual high-DPI pixels into the original temporary workspace` 的关键断言；测试框为 160×90 CSS 像素、DPR=2，fixture 中心标记为纯红色：

  ```ts
  expect([capture.width, capture.height]).toEqual([320, 180]);
  expect(capturedMarkerPixel).toEqual([255, 0, 0, 255]);
  expect(attachment.workspaceId).toBe(workspaceA.id);
  expect(parentAfter).toEqual(parentBefore);
  ```

- [ ] **Step 2: Run `npm test -- tests/unit/hotkeys.test.ts tests/integration/attachments.test.ts`、`npm run test:e2e -- tests/e2e/capture.spec.ts`。** 预期捕获入口/保存接口缺失失败。
- [ ] **Step 3: 实现捕获与快捷键。** document 捕获从 PDF 现有画布裁切/合成，MD 使用 html-to-image 完成 DOM→canvas 再按实际比例裁切；归一化原文坐标与截图像素坐标分别保存。等待字体/图片及页面渲染完成，截已可见内容；canvas 污染/体积超限明确错误。屏幕入口由用户点击触发 `getDisplayMedia`，选屏幕/窗口后预览一帧、框选并 finally stop 所有 tracks；仅 HTTPS/localhost 可用时展示能力。生成临时附件预览与“解释截图”/编辑问题动作；不捕获后台全局键。设置持久化 bindings，防止输入组合/浏览器保留键冲突；内置 CaptureProvider/HotkeyProvider 真正通过 browser registry 调用。
- [ ] **Step 4: Run 三测试及 typecheck；实际走一次屏幕授权和取消。** 预期文档截图在真实浏览器通过像素/定位验证；测试注入的屏幕流只验证生命周期，真实授权路径另记为人工浏览器证据，不能混为一谈。
- [ ] **Step 5: Commit 信息 `feat: capture anchored regions into temporary conversations`。

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

## Task 15: 跨平台发行、真实阅读验收与交付证据

**Files:** Create `scripts/{acceptance,live-model,fixture-manifest}.mjs`；`tests/e2e/full-flow.spec.ts`；`tests/integration/cli-distribution.test.ts`；`.github/workflows/ci.yml`；`README.md`；`docs/{installation,verification}.md`；`docs/evidence/README.md`。Modify 根 package scripts/files/bin 和 CLI resource 定位；实际证据写入 `docs/evidence/<date>/`，不包含凭据或用户原文。

**Interfaces:** Produces 可发行 npm 包与 `reader-workbench web|doctor|mcp`；`npm run test:live -- --workspace <test-directory> --provider <provider-id>` 通过已配置 credentialRef 调用真实模型；`npm run acceptance -- --workspace <test-directory>` 输出 R01–R23 的 evidence manifest（status 为 passed/failed/not-tested），每项含命令/平台/文件哈希/证据路径。

- [ ] **Step 1: 写发行与完整流程测试。** `npm pack` 安装至空临时目录后单条启动、doctor、static/worker/assets 可用、stdio 可连接；CLI 启动目录有中文/空格。浏览器从先选工作区到四类文件阅读、主/临时追问、缩放/自由布局、右键/截图、生成/重开文件、插件调用、重启恢复全部贯通。坏文档、只读工作区、端口占用、转换缺依赖/取消、模型失败和断连恢复都不能显示虚假成功。

  `starts the installed package with no source workspace links` 的关键断言；在空安装目录运行 CLI 子进程并请求打包后的 worker：

  ```ts
  expect(cliHealthResponse.status).toBe(200);
  expect(packagedPdfWorkerResponse.status).toBe(200);
  expect(restartedTemporaryHistory).toEqual(savedTemporaryHistory);
  expect(evidenceForUnrunPlatform.status).toBe('not-tested');
  ```

- [ ] **Step 2: Run `npm test -- tests/integration/cli-distribution.test.ts`、`npm run test:e2e -- tests/e2e/full-flow.spec.ts`。** 预期指出缺发行资源或尚未贯通步骤；禁止用跳过断言换成通过。
- [ ] **Step 3: 完成发行与文档。** 打包全部编译包、Web assets/PDF worker 和示例插件，生成 Windows/macOS/Linux 相同 CLI 用法与 LibreOffice 安装/发现说明。CI matrix 为 windows-latest/macos-latest/ubuntu-latest、Node 24，安装转换依赖并跑对应检查；能运行才填平台通过。live 脚本用人工测试工作区和短样例做主/临时真实流式调用、选区来源及视觉模型可用时的截图，检查动态继承/隔离；仅输出脱敏 IDs/状态，失败不写 completed。README 区分初次安装与日常一条启动、布局/缩放/快捷键、外部调用/插件/Python、Web 截图范围和全局热键限制。
- [ ] **Step 4: Run `npm ci`、typecheck、unit/integration、build、完整 e2e、acceptance 和实际发行启动。** 使用新鲜测试结果；Windows 真实转换与渲染逐页检查，确认图片/表格/公式及生成文件均可读。有用户配置的 API 时跑 live；没有 Key 就将 R06 标 not-tested 并请用户配置，不能把 demo 作为通过。macOS/Linux 没有实际机器/CI 结果时标 not-tested；CI YAML 不是运行证据。屏幕捕获授权人工证据单列。完整验收结束后使用 requesting-code-review 获得独立全分支审查，再修复具体问题和相关回归；未经明确授权不指定付费模型、不创建 PR/远程部署。
- [ ] **Step 5: Commit 信息 `chore: package reader workbench and record acceptance evidence`。** 用 finishing-a-development-branch 决定本地集成方式；不丢隔离工作区内源码/证据。交付启动命令、应用入口、工作区文件位置及尚未实测项目；仅当目标实际全部达到才标 goal complete。

## 需求到实现及证据的映射

### 用户追加要求与执行顺序

2026-10-11 用户在实施中要求思考深度和直接内置的离线语音，按规格第 19 节执行。思考深度并入任务 7 的模型/AskRequest、任务 9 的两个输入栏和任务 15 的真实 API 验收。新增任务 16 在任务 14 之后、任务 15 之前执行，接入任务 9 的两个输入栏；任务 15 汇总 R01–R25 证据。原有任务不删减，全分支审查仍在所有任务和验收完成后执行。

## Task 16: 内置 SenseVoice 离线语音输入

**Files:** Create `packages/contracts/src/speech.ts`；`packages/core/src/speech/{service,assets,wave}.ts`；`packages/core/src/speech/worker.mjs`；`apps/server/src/routes/speech.ts`；`apps/web/src/voice/{recorder,VoiceInput}.tsx`；`tests/integration/speech.test.ts`、`tests/unit/wave.test.ts`、`tests/e2e/voice-input.spec.ts`；`scripts/voice-smoke.mjs`。Modify capability SDK、server/CLI/build、task 9 composers、安装文档和 evidence manifest。

**Interfaces:** SpeechProvider 提供本地 processingLocation、支持语言、prepare(signal,onProgress)、transcribe(audio,language,signal)、dispose。SpeechService.catalog/prepare/transcribe/cancel 使用同一认证与工作区/会话所有权；transcribe 返回 text/audioSeconds/inferenceSeconds，不写 Session。Model asset manifest 固定 URL/大小/SHA-256。运行库固定 sherpa-onnx-node 1.13.8。默认 INT8 SenseVoiceSmall 模型 239233841 bytes；sha256 c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51；tokens 315894 bytes/sha256 f449eb28dc567533d7fa59be34e2abca8784f771850c78a47fb731a31429a1dc。

- [ ] **Step 1:** 写 WAV 和服务测试。有效 16 kHz PCM16、坏头/超长/越界、取消/超时、队列、准备损坏文件重试、所属会话验证、不写父历史。先运行 `npm test -- tests/unit/wave.test.ts tests/integration/speech.test.ts`，预期缺实现失败。
- [ ] **Step 2:** 实现资产准备和受管理子进程识别，真实安装 npm 平台运行库并检查导入。模型下载到本机、逐文件哈希一致；真实生成的中文/英文语音得到合理转写，阻止外网访问后仍成功，不能以模拟输出充当本地模型证据。
- [ ] **Step 3:** 接入任务 9 的两个 composer，PCM16 转换、录音波形与计时、停止/取消和 stale draft 保护。实际跑浏览器麦克风授权及录音按钮；浏览器测试使用真实音频输入设备替代可重放测试样例，拒绝权限保留草稿。
- [ ] **Step 4:** 运行 named tests、typecheck/build、真实 `scripts/voice-smoke.mjs` 和 `tests/e2e/voice-input.spec.ts`。未运行的平台单列。包内可携带预下载模型或自动准备，用户不需配置语音 API、安装 Python 或手动启服务。
- [ ] **Step 5:** Commit `feat: embed offline SenseVoice dictation`。记录服务端、浏览器测试与模型实证，任务 15 补充发行资源的后续消费者证据。

## 需求到实现及证据的映射（含追加项）

| ID | 实施任务 | 核心证据 |
| --- | --- | --- |
| R01 | 1、9、15 | CLI 发行启动、HTTP、实际浏览器 |
| R02 | 1、4、15 | 平台矩阵及真实日志，未测平台明确标记 |
| R03 | 10 | 六种排序、分隔线、刷新恢复截图 |
| R04 | 4、9、15 | 四类含图表公式样例、旧 DOC/PPT 真实转换及页面 |
| R05 | 2、4、8 | 源 SHA-256、新旧版本缓存 |
| R06 | 7、9、15 | 真实 API 主/临时流式输出；模拟单列 |
| R07 | 5、6 | 最新 mainRevision、完整追问链、每次 envelope |
| R08 | 3、5、6、11、12、14 | 父消息/revision/summary/tool-state 前后哈希 |
| R09 | 4、7、9、11、12 | 锚定选区、图像能力、引用定位 |
| R10 | 4、5 | 大文档全文索引、摘要覆盖、原记录查询 |
| R11 | 8、9、15 | 四格式生成、来源、真实重新预览 |
| R12 | 3、14 | 插件注册/调用/设置/界面/停用 |
| R13 | 13 | 独立 HTTP/MCP 客户端，共享同一状态 |
| R14 | 3、14 | 外部 stdio/HTTP 工具、断连、临时写权限拒绝 |
| R15 | 1、4、5、6、7、9、15 | 持久化恢复、取消/失败/幂等/重启 |
| R16 | 1、2、3、7、9、13 | 认证、边界链接、文档脚本、凭据脱敏 |
| R17 | 2、4、8、9、12 | 工作区优先、原件原位、输出/截图/A→B 归属 |
| R18 | 10、11、12 | 独立 50–200% 正文缩放、选区/截图坐标 |
| R19 | 10 | 三列/三行/四混合、自定义、宽/窄窗口 |
| R20 | 11 | 四类文字实际左选/右询、临时答案 |
| R21 | 7、12 | 绑定冲突、DPR 像素、取消和实际屏幕授权 |
| R22 | 9、15 | 官方视觉参考及成品浏览器截图核对 |
| R23 | 14 | 真实 Python 进程注册/调用/取消/作用域 |
| R24 | 7、9、15 | 实际 reasoning_effort、协议 thinking 参数、两栏独立选项、在途冻结 |
| R25 | 16、9、15 | 模型固定哈希、真实离线识别、麦克风/草稿/取消、发行资源 |

## 计划自审与交接

- 已逐项对照规格 1–18 节及 R01–R23；上述表中每项都有实现任务和证据。
- 每个任务有一个独立可验证交付，配置/脚手架/说明归入需要它的任务，没有单独的空壳任务。
- 模型/插件/界面不会写另一份 Agent 逻辑；共享 ID、来源、RunScope、AskRequest 和 revision 名称一致。
- Review Focus 五项已加到拥有相应代码的任务测试中。
- 代码块只描述关键断言/签名，不预先抄写实现；所有业务成功须以实际文件/进程/接口/浏览器证据确认。
- 当前仅规格和计划已编写，尚未执行这些代码任务；勾选框表示未来验证状态，不代表已通过。

建议 **Native**：由当前会话顺序实现，再在末尾进行独立全分支审查。15 个任务共享同一组工作区、来源和会话契约，连续实现有利于保持一致。若用户更重视每个任务都独立审查，可选 **Subagent-driven**，由新实现者和新审查者逐任务推进；会使用更多上下文。收到书面计划审阅和执行方法选择后，才进入实现。

## 实施资料核对记录

- [MCP TypeScript SDK 官方仓库](https://github.com/modelcontextprotocol/typescript-sdk)：2026-10-11 核对到稳定 v2，使用分包 server/client/fastify；v1 包路径不能混用。
- [Vite 官方入门](https://vite.dev/guide/)：安装时核对 Node 与浏览器支持并锁定依赖。
- [Node SQLite 文档](https://nodejs.org/api/sqlite.html)：仅使用本机 Node 24 实际存在的 API；当前官网最新 Node 文档不能代替 Node 24 测试。
- [PDF.js](https://github.com/mozilla/pdf.js)：服务器解析、浏览器 canvas/TextLayer 和 worker 必须锁同一版本。
- [html-to-image 原始仓库](https://github.com/bubkoo/html-to-image)：DOM 到图像提供接口；字体、资源和 CORS 能力以实际浏览器测试为准。
- [DeepSeek Harness 官方页面](https://www.deepseek.com/en/harness/)：已核对页面资料；本轮浏览器参考工具启动失败，尚未完成视觉截图核对，此项在任务 9 开始界面实现前补做。
