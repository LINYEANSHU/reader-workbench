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

