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

