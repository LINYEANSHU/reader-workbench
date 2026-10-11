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

