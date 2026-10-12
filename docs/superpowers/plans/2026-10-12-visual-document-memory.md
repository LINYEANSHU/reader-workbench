# Visual Document Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 首次提问通过所有页图像建立本地文档记忆，后续提问复用记忆并可回看指定页，通过真实插件消费者接通并交付 Git 版本 0.2.0。

**Architecture:** 新增 `documentMemory` SDK 能力及受控宿主，核心负责权限、租约、页图像、本地原子保存和运行桥接。`visual-document-memory` 插件负责批次、阅读提示、逐页记忆、全文概览及记忆选择；首次阅读与问答分开调用模型，后续上下文不含自动附加的文档图像。

**Tech Stack:** 现有 Node.js >=24、TypeScript、Fastify、React、PDF.js、@napi-rs/canvas、Vitest、Playwright；OpenAI 兼容 chat/completions，用户指定 deepseek-flash；不新增产品依赖。

**Spec:** `docs/superpowers/specs/2026-10-12-visual-document-memory-design.md`（已获用户确认）。

## Global Constraints

- 首次对话读取所有页：能放下一次请求时一次发送；超限顺序分批，不遗漏页、不默认退回第一页。
- 原件、页图像、原文文字、阅读记忆、会话历史保存在所属本地工作区；记忆不是模型隐藏状态或思考过程。
- 用户配置为 `deepseek-flash`，保留现有 OpenAI 兼容调用方式，不自动更换模型；其他服务使用保守图像限制。
- 文档记忆单独保存，不伪造用户轮次、不改变现有对话 MemoryProvider；原文和图片不灌入永久消息历史。
- 每次请求仍显式发送应用管理的记忆，摘要不承诺无损保留图像细节；需要时只回看指定页。
- 工作区、文档版本、模型配置身份、插件/提示词版本构成记忆键；不得包含密钥。
- SDK 1.1.0，插件 1.0.0，应用 0.2.0；保留 v0.1.0，最终新建注释标签 v0.2.0，不自动远程推送。
- 在当前聊天执行并保留现有分支 `codex/visual-document-memory`；执行时遵循 worktree 技能，已有适合的隔离 checkout 则复用，原目录运行资源不清理。
- 真实收费 API 验证需确认当前用户授权；默认先协议验证，未测内容在交付中明确记录。

## Review Focus

1. 相同文档 ID 的不同内容版本或不同工作区，不能复用旧记忆；Task 2/5 测实际隔离。
2. 主/临时对话同时开始预读，其中一个取消，不能重复收费或使另一请求失败；Task 2 测共享任务、独立租约与最后等待者取消。
3. 视觉模型返回合法 JSON 却漏掉末页或重复页，不能标记 ready；Task 1/4 测严格页码集合与最后一页内容。
4. 同名自有插件、用户曾停用、打包后重启，不能覆盖自有包或再启用；Task 6 测安装状态与发行包。
5. 大记忆、小上下文、超大单页、回看图像跨文档及图像留在历史，不能静默截断或越界；Task 3/5/7 测预算、授权与实际发送消息。

## 文件与责任

| 文件 | 责任 |
| --- | --- |
| packages/contracts/src/document-memory.ts | 持久记忆、页记录、状态、引用、严格结构校验 |
| packages/sdk/src/document-memory.ts | 插件 provider 与宿主接口，独立于对话 MemoryProvider |
| packages/core/src/documents/memory-store.ts | 版本/模型/插件记忆键、受控路径、原子 checkpoint 和重建 generation |
| packages/core/src/documents/memory-consumer.ts | 消费插件、共享任务、宿主桥、读取引用与进度 |
| packages/core/src/models/image-budget.ts | 图像限制、实际编码请求体预算，兼容服务的默认上限 |
| plugins/visual-document-memory/{plugin.json,index.mjs,reading.mjs,context.mjs} | 注册、批次预读/概览、基于页码的记忆选择 |
| packages/core/src/sessions/context.ts / runs/{service,tool-loop}.ts | 首次准备、记忆注入、图像回看与对话保存边界 |
| packages/core/src/tools/document-memory.ts | 受控读取记忆页及单页回看的工具消费者 |
| packages/core/src/plugins/bundled.ts | 共享的随包插件定位与首次安装启用 |
| apps/server/src/routes/document-memory.ts | 已认证的状态/按页记忆查看与重建标记 |
| apps/web/src/workbench/DocumentMemoryPanel.tsx | 状态、页记忆、重试与重建界面 |

改动保留现有文件风格，新增职责使用独立小文件，不重构无关模块。

### Task 1: 定义 SDK 与文档记忆契约

**Files:** Create `packages/contracts/src/document-memory.ts`, `packages/sdk/src/document-memory.ts`, `tests/unit/document-memory-contract.test.ts`; modify contracts/sdk `index.ts`、`capabilities.ts`、SDK `manifest.ts`、`sessions.ts`、`models.ts`、`tools.ts`。

**Interfaces:**
- `DocumentMemoryPage`: `page:number`, `summary:string`, `transcription:string`, `figures:string[]`, `formulas:string[]`, `terms:string[]`, `uncertainties:string[]`, `crossPageRelations:Array<{pages:number[];text:string}>`。
- `DocumentMemoryRecord`: `schemaVersion:1`, `document:DocumentRef`, `pluginId`, `promptVersion`, `modelIdentity`, `generation`, `pageCount`, `status:'partial'|'ready'`, `pages:DocumentMemoryPage[]`, `completedPages:number[]`, `batches:Array<{pages:number[];completedAt:string}>`, `overview:string`, `createdAt`, `updatedAt`。
- `DocumentMemoryReference`: `document`, `pluginId`, `cacheKey`, `generation`, `pageCount`, `completedPages`, `status`; optional `ContextEnvelope.documentMemories` uses this type.
- `DocumentImageHost`: `describe():Promise<DocumentRecord>`; `readPageImage(page:number,signal:AbortSignal):Promise<{page:number;mime:string;bytes:Uint8Array;anchors:SourceAnchor[]}>`; `readPageText(page:number):Promise<string>`。
- `DocumentMemoryHost extends DocumentImageHost`: readonly `pluginId`, `modelIdentity`, `generation:number`, `capabilities`, `imageLimits`, `memoryBudgetBytes`; `load():Promise<DocumentMemoryRecord|null>`; `save(record,signal):Promise<void>`; `generate(request:ModelRequest,signal):AsyncIterable<ModelEvent>`; `progress({completedPages:number;pageCount:number;label:string}):Promise<void>`。
- `DocumentMemoryProvider`: `promptVersion:string`; `supports(record:DocumentRecord):boolean`; `prepareLocal(host:DocumentImageHost,signal):Promise<void>`; `prepare(host:DocumentMemoryHost,signal):Promise<DocumentMemoryRecord>`; `select(record,question:string,budgetBytes:number):{text:string;pages:number[]}`。
- `ModelProvider.identity?:string` and `imageLimits?:ModelImageLimits`; `ModelImageLimits` contains `maxImages`, `maxImageBytes`, `maxTotalImageBytes`, `maxRequestBytes`, `imageTokens`; optional `ModelSettings.imageLimits` uses the same fields for explicit overrides。
- Optional `ToolResult.pageImages:SourceAnchor[]` describes authorized page references only, never raw Base64; existing tools need no change.

- [ ] Write `rejects_missing_duplicate_or_out_of_range_pages`, `ready_requires_all_pages_and_overview`, `rejects_wrong_document_or_model`, `old_plugins_accept_sdk_1_1` tests. `validateMemoryRecord(value, expected:{document,modelIdentity,pluginId,promptVersion,pageCount,generation}, maximumBytes)` returns the typed record; pages must be unique and coverage must equal persisted page records.
- [ ] Run `npx vitest run tests/unit/document-memory-contract.test.ts`; confirm missing contracts fail before implementation.
- [ ] Implement the interfaces and exported validator. Bound page strings to 64 KiB, record to 64 MiB, overview to 64 KiB; reject unexpected types and invalid cross-page references. Export SDK/contracts types and extend CapabilityMap with `documentMemory`; set SDK_VERSION to `1.1.0`.
- [ ] Run targeted tests and `npm run typecheck`; expect pass with old SDK consumers still compiling.
- [ ] Commit only this task's files: `feat: define document memory plugin contracts`.

### Task 2: 本地记忆存储、并发和任务租约

**Files:** Create `memory-store.ts`, `memory-consumer.ts`, `tests/integration/document-memory-store.test.ts`; modify `packages/core/src/plugins/registry.ts`。

**Interfaces:**
- `CapabilityLease<T>` returned by `acquire`: `value:T`, `release():void`, `fork():CapabilityLease<T>`; fork retains the same entry, including a retired but still leased provider. Fork after release fails.
- `DocumentMemoryStore(workspaces)`: `key(ref,pluginId,promptVersion,modelIdentity):string`; `load(ref:DocumentRef,key:string):Promise<DocumentMemoryRecord|null>`; `save(ref,key,record,signal):Promise<void>`; `requestRebuild(ref,key):Promise<number>` returns a new generation while preserving the last valid record. The explicit ref resolves the owning workspace; the opaque hash never supplies a root path.
- `DocumentMemoryConsumer(documents,repository,capabilities,store)`: `prepare(request:AskRequest,scope:RunScope,modelLease:CapabilityLease<ModelProvider>,signal,onProgress):Promise<Array<{reference:DocumentMemoryReference;record:DocumentMemoryRecord;providerId:string}>>`; `prepareLocal(ref,signal):Promise<void>`; `close():Promise<void>`。
- Shared task keyed by store key + generation has its own forked model/provider leases, AbortController, subscriber map and promise. Each subscriber gets its own abortable wait and progress callbacks. Joining requires repository authorization for that subscriber; host operations revalidate the pinned document and at least one authorized active subscriber, rather than retaining a first caller's released RunScope. Local prepare jobs have separate document-job provenance and cannot invoke models or write dialogue history.

- [ ] Write tests for atomically persisted partial/ready records and restart load; two workspaces/versions/models produce separate keys; invalid checkpoint does not replace valid file; unsafe links rejected; rebuilding preserves last good record.
- [ ] Write concurrency tests: simultaneous waiters trigger one build; cancelling one still completes the other; cancelling all aborts the build; changing model settings or disabling plugin waits for forked leases. Model spy must receive one build, not two.
- [ ] Run `npx vitest run tests/integration/document-memory-store.test.ts tests/unit/plugins.test.ts`; expect missing store/consumer failures.
- [ ] Implement guarded `<internal>/document-memory/<plugin-id>/<hash>/generation-<n>.json` paths and latest-generation metadata with atomic rename. Per-key queue validates generation immediately before commit. A rebuild never deletes old memory, and a stale task cannot overwrite a newer generation. Consumer pins refs and validates actual ready PDF/image descriptors; plain text/Markdown follows existing text path.
- [ ] Run targeted tests and typecheck; expect no race, cross-workspace reuse or lease leak.
- [ ] Commit: `feat: persist and coordinate document reading memory`.

### Task 3: provider 图像限制与精确请求体预算

**Files:** Create `packages/core/src/models/image-budget.ts`, `tests/unit/image-budget.test.ts`; modify `openai-compatible.ts`, `settings.ts`, `tests/integration/model-adapter.test.ts`。

**Interfaces:**
- `resolveImageLimits(settings:ModelSettings):ModelImageLimits`; optional settings override is validated and exposed in masked settings. Conservative default remains 4 images, 4 MiB/image and 12 MiB total; request-body default 16 MiB.
- For exact official host `api.deepseek.com` and user model `deepseek-flash`, declared visual limits: 600 images, 32 MiB inline/image, 64 MiB image total, 48 MiB request body, 1024 estimated tokens/image. Do not apply this profile based on arbitrary host substring or to all compatible models.
- `validateImageRequest(messages, limits, body:Record<string,unknown>):void` checks actual UTF-8 JSON body including Base64, role, MIME and decoded bytes.
- Provider identity is SHA256 of normalized endpoint, model and relevant capability settings; credentials are excluded. Provider accepts the leased limits snapshot.

- [ ] Test official Flash accepts 5 valid images where generic profile still rejects; Base64 body exceeds limit despite decoded bytes fitting; exact boundary values pass; oversized single image fails; images in unsupported roles fail; keys never enter identity/diagnostics.
- [ ] Run `npx vitest run tests/unit/image-budget.test.ts tests/integration/model-adapter.test.ts`; confirm regression failures on current hard-coded 4-image provider.
- [ ] Implement resolver and provider validation after constructing actual request body; optional override fields in settings schema. Expose verified vision/limit metadata in discover/catalog without silently changing an existing saved configuration.
- [ ] Run targeted tests and typecheck; expect generic model compatibility retained.
- [ ] Commit: `feat: enforce provider-specific image budgets`.

### Task 4: 实际逐页视觉记忆插件

**Files:** Create `plugins/visual-document-memory/plugin.json`, `index.mjs`, `reading.mjs`, `context.mjs`, `tests/unit/visual-document-memory.test.ts`。

**Interfaces:** Uses Task 1 host; exports default Plugin from `index.mjs` and named `prepareLocal`, `prepare`, `select` helpers for tests. Plugin ID `visual-document-memory`, version `1.0.0`, sdkRange `^1.1.0`, registered capability `visual-document-memory.reader`, promptVersion `1`。

- [ ] Write tests using host/model spies: 7 distinguishable page images all go in one request when they fit; a 3-image host yields batches [1,2,3], [4,5,6], [7]; failed last batch leaves partial then retry only submits page 7; invalid/missing/duplicate page output fails; last-page marker persists. Ready cache performs zero visual model calls.
- [ ] Add budget tests: one oversized page returns clear error, output-token budget splits a batch, overview reduction itself stays bounded, large record selection returns overview/index/relevant pages with honest partial-context wording. Document instructions do not trigger tools.
- [ ] Run `npx vitest run tests/unit/visual-document-memory.test.ts`; confirm absent plugin failures.
- [ ] Implement local page rendering 1..N using host and cache. Build maximal feasible ordered batches using actual candidate JSON byte size, host image limits and context/output budgets; reserve 768 output tokens/page + 512 framing, bounded by actual model max output. Single-page impossibility is an error, not truncation. Request `tools:[]`, require a complete model event and JSON `{pages:[...]}`, validate exact submitted pages, save each completed batch.
- [ ] Generate overview with a bounded reduction tree from page records, including page sources; no image history or unbounded accumulated batch context. Mark ready only after full coverage and successful overview save. `select` sends full memory when it fits; otherwise overview, complete compact page index and relevant page details, always preserving local full records. Use lexical query scoring, stable page order, and explicit instructions to read additional memory via tools. If even the minimum overview/index cannot fit, return CONTEXT_LIMIT with instructions to increase capacity; do not silently truncate that index.
- [ ] Run targeted tests, plugin manifest/SDK validation and typecheck. Commit: `feat: add visual document memory plugin`.

### Task 5: 首次对话消费、后续记忆与受控页回看

**Files:** Modify `sessions/context.ts`, `runs/service.ts`, `runs/tool-loop.ts`, `tools/executor.ts`, `plugins/registry.ts`; create `tools/document-memory.ts`, `tests/integration/document-memory-runs.test.ts`; update `tests/unit/context-budget.test.ts`。

**Interfaces:** ContextBuilder accepts optional execution options `{modelLease,onProgress,documentMemory}` after existing parameters; existing callers remain valid. Consumer prepares records before document context assembly. It supplies validated `ContextEnvelope.documentMemories` and provider-selected text. `DocumentMemoryTools(consumer,documents,runRepository)` registers read-only `read_document_memory(documentId,version,page)` and `revisit_document_page(documentId,version,page)`.

- [ ] Add actual RunService tests: first request performs visual pre-read then answers from memory; second/restart request contains memory and zero automatic document images; first-page and last-page facts differ; plain Markdown and disabled-plugin behavior remain available; user screenshots/selected pages remain deliberate inputs.
- [ ] Add tests for whole-memory budget versus overview/selected pages, stale memory after file change, main/temporary isolation, unsupported visual model, persisted progress events, invalid documentMemory context transform, and first-question failure without fake completion.
- [ ] Add tool tests: read other memory page; revisit only requested page; reject references outside current run documents or wrong version; actual next model request has user-role image; committed history and tool-result records contain references/text, never page Base64. Response from revisit never uploads all pages.
- [ ] Run `npx vitest run tests/integration/document-memory-runs.test.ts tests/unit/context-budget.test.ts tests/integration/runs.test.ts`; observe expected missing consumer integration failures.
- [ ] Integrate consumer using forked model lease. For handled documents replace automatic search-excerpt/first-page assembly with memory messages, retain selected text and explicit attachment behavior. Reserve bounded memory budget before compressing dialogue history. Include memory source anchors without implying all pages were attached to this particular answer.
- [ ] Resolve `ToolResult.pageImages` only after checking authenticated RunScope and pinned run document refs; ToolExecutor validates refs and persists small metadata. Tool loop emits ordinary textual tool result plus transient user-role image into the live model request; add no image to `ownMessages`. Enforce Task 3 limits and context budget after inserting transient image.
- [ ] Validate context plugins cannot replace or invent another run's documentMemory references. Persist exact memory references with run context for auditing. Run targeted tests and typecheck; commit: `feat: use local document memory in conversations`.

### Task 6: 自动准备、随包安装、状态 API

**Files:** Create `packages/core/src/plugins/bundled.ts`, `apps/server/src/routes/document-memory.ts`, `tests/integration/document-memory-api.test.ts`; modify `documents/service.ts`, `apps/server/src/app.ts`, `routes/plugins.ts`, `openapi.ts`, `tests/integration/cli-distribution.test.ts`。

**Interfaces:** `DocumentService.onParsed?: (ref:DocumentRef)=>void` runs only after ready state persisted; consumer queues `prepareLocal` without network, holding a plugin lease and private cancellable job. Extend `DocumentService.readPage(ref,page,signal?:AbortSignal)` without breaking existing callers; propagate signal through renderPdfPage and use abortable serialization by document/version/page to avoid concurrent cache writes. `ensureBundledPlugins(plugins,workspaceId):Promise<void>` shares source/package path resolution.

- [ ] Test local import/render creates all page caches with zero model calls; first question can safely overlap image preparation; preparation cancelled/shutdown releases resources. Text-only files skip visual preparation.
- [ ] Test workspace first use installs/enables visual plugin; explicit disable survives reload/restart; same-ID custom plugin remains byte-identical; existing helper install routes continue working; empty-directory npm package includes and loads plugin.
- [ ] Test owned status/page/rebuild routes, cross-owner denial, unknown version rejection, per-page response, incomplete state diagnostics; rebuilding is only a local generation marker and makes no paid request.
- [ ] Run `npx vitest run tests/integration/document-memory-api.test.ts tests/integration/plugin-extension.test.ts tests/integration/plugin-consumers.test.ts`; confirm missing routes/default setup failures.
- [ ] Wire consumer before RunService and app close order; attach ready callback and workspace plugin install after saved plugin state load. Routes under `/api/v1/workspaces/:id/documents/:documentId/:version/memory`: GET status with model/provider selection; GET `/pages/:page`; POST `/rebuild` returns generation; no arbitrary path or raw key. Use existing auth/owner checks, require explicit selected provider for non-ready lookup. GET absent memory returns status `not-started`, not fabricated data. Extend server services for tests and published API metadata.
- [ ] Run targeted tests/typecheck and build/package distribution test. Commit: `feat: install and expose visual document memory`.

### Task 7: 设置、进度、页记忆与浏览器验收

**Files:** Create `apps/web/src/workbench/DocumentMemoryPanel.tsx`, `tests/e2e/document-memory.spec.ts`; modify `api/client.ts`, `workbench/{DocumentPane,ChatPane,SettingsDialog}.tsx`, `plugins/PluginSettings.tsx`, corresponding existing styles, `tests/e2e/fixtures.ts`。

**Interfaces:** API client adds `documentMemoryStatus(ref,providerId)`, `documentMemoryPage(ref,providerId,page)`, `rebuildDocumentMemory(ref,providerId)`. Panel accepts active document/model and callbacks; run progress displays `已处理 X / N 页`, `生成文档概览`, `根据文档记忆回答` using persisted progress events.

- [ ] Extend protocol fixture to recognize pre-read prompts/images and return structured per-page memory; retain current generic answer fixture behavior. Create a synthesized 7-page PDF at test runtime, with distinct first/last page, scan and chart; no user files.
- [ ] Browser test imports PDF, sees local preparation without answer request, asks first question, verifies every image submitted and state ready; second question sees local-memory request and no automatic image. Test restart, last-page answer/citation, opening stored memory page, disabled plugin persistence, rebuild marker and retry.
- [ ] Test oversized page/invalid pre-read shows honest error and completed-page count, no full-read success; manual screenshot remains visible and sent intentionally.
- [ ] Run `npx playwright test tests/e2e/document-memory.spec.ts`; confirm missing panel/flow failures.
- [ ] Implement accessible status and viewing controls in document panel/settings, bounded polling only while active local preparation/run; cancel on unmount/workspace switch. Retry resubmits via existing explicit user question flow; rebuild confirms the concrete document locally and preserves old record. No API implementation jargon in ordinary reading messages.
- [ ] Run new browser test plus reading/capture/plugins regressions; inspect saved screenshots for clipping, progress and errors; commit: `feat: show document reading memory and progress`.

### Task 8: 完整验证与 Git 版本更新

**Files:** Modify `package.json`, `package-lock.json`, `CHANGELOG.md`, `docs/{plugins,api,verification,versioning}.md`, `apps/cli/src/mcp.ts`, `apps/server/src/{openapi,mcp/server}.ts`; create `docs/evidence/2026-10-12/visual-document-memory/manifest.json` and concise validation report. SDK bump already belongs to Task 1; plugin own version belongs to Task 4.

- [ ] Run `npm run typecheck`, `npm run build`, `npm test`, `npm run test:e2e`, and existing packaged empty-directory installation test. Fix material regressions; do not call simulated protocol evidence a real DeepSeek result. Record command, exit status, test counts, screenshots and skipped resource tests separately.
- [ ] Request current authorization for a bounded real DeepSeek visual test only if needed and permitted; never expose or copy keys into evidence. Otherwise explicitly mark `real-deepseek-visual: not-tested`. Model compatibility/source verification is not real model execution evidence.
- [ ] Review full branch against approved spec, especially all-page coverage, consumer activation, subsequent image-free requests, restart and lease lifecycle. Execution approach determines whether a fresh reviewer is dispatched; no subagent unless selected by user/required executing skill.
- [ ] Update application using `npm version minor --no-git-tag-version` only once, verify 0.1.0 -> 0.2.0 in package and lockfile; synchronize CLI bridge and server MCP/OpenAPI runtime fields. Move actual implemented/verified changelog entries to `0.2.0 — 2026-10-12`. Check tag v0.2.0 does not already exist.
- [ ] Rebuild and rerun affected version/distribution checks, `git diff --check`, inspect exact staged files, commit `chore: release reader workbench 0.2.0`. Pack into ignored `release/`, inspect contents and fresh install version; record hashes.
- [ ] With no unrelated local changes, fast-forward `main` to feature branch via existing workflow, then create annotated `v0.2.0`; never reset, force-push or overwrite a tag. Verify `git status --short`, `git log -3 --oneline`, `git show v0.2.0 --stat` and version output. Preserve managed checkout attachments and user-owned caches.
- [ ] Deliver concise behavior, verification evidence, local memory location, commit/tag, and any real-API test limitation. Do not mark completed while required consumer/UI/restart/version checks remain unfinished.

## 自检与执行交接

设计逐项对应：SDK/插件职责 Task 1/4；本地原子记忆/并发/重建 Task 2；请求限制 Task 3；首次与后续请求/回看/会话保存 Task 5；上传准备/安装与 API Task 6；可见状态与浏览器 Task 7；Git/版本与验收 Task 8。五项 Review Focus 均列入对应测试。

推荐 **Native：当前聊天由主代理逐项实现**。这些任务共享宿主和存储契约，连续实现可以减少接口交接；全分支审查与真实 consumer 测试放在交付前。另一选择是 Subagent-driven：各任务分别实现和独立审查，调用次数更多。

状态：计划已编写并自检，等待用户审阅并选择执行方式；未开始产品代码修改。
