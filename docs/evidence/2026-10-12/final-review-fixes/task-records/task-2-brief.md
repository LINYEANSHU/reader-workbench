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

