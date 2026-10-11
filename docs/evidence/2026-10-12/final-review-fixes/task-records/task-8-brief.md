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

