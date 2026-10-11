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

