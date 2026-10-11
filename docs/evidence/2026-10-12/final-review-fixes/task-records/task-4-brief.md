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

