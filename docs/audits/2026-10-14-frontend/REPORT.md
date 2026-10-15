# Reader Workbench 前端技术审计

日期：2026-10-14（Asia/Shanghai）

范围：当前项目全部前端界面，以 `apps/web` 为入口；仅生成报告，未修改应用源码或设计配置。

## 实现完整性结论

**通过产品一致性检查；技术质量仍需整改。** 工作区、原文、主对话、临时追问、逐页记忆和文件授权构成明确且一致的阅读工作台。没有发现把演示回答冒充真实模型输出的情况，也没有根据通用装饰规则要求替换既有界面。

Impeccable 检测器产生 **3 个 warning**，退出码为 1，表示发现警告，并非扫描执行失败：

| 文件与位置 | 检测结果 | 人工核对 |
|---|---|---|
| `src/styles/tokens.css:1` | Inter 字体过于常见 | 字体栈包含系统及中文回退；这不是响应式、无障碍或性能缺陷，不计入问题数量。 |
| `src/styles/selection.css:1` | 引用框左侧强调线 | 此处确实承载“所选原文”及来源，具有产品意义，不按装饰缺陷计入。 |
| `src/styles/viewers.css:1` | Markdown 引用左侧强调线 | 标准引用语义的视觉表达，不计入技术缺陷。 |

检测器只覆盖其规则库；没有警告不意味着通过 WCAG 或性能检查。实际技术问题来自下述源码检查与浏览器复现。

## 概览

**审计健康分：10/20，Acceptable（可用，但需要明显改进）。** 这是本次审计的工程评分，不是自动化工具分数或 WCAG 合规认证。

| 维度 | 分数（0–4） | 主要依据 |
|---|---:|---|
| 无障碍 | 2 | 已有标签、焦点样式和键盘分割线；模态焦点、按钮对比度、键盘截图仍有明显缺口。 |
| 性能 | 2 | PDF 按可见范围渲染；首屏包含重型阅读功能，大型 Markdown 出现长任务。 |
| 主题实现 | 2 | 已有基础变量和暗色模式；大量颜色仍直接写在样式中，部分变量未定义。 |
| 响应式 | 1 | 有断点和用户可选纵向布局，但窄窗口工具栏裁切、正文缩放溢出和短窗口弹层问题仍存在。 |
| 实现完整性 | 3 | 产品结构连贯，扫描警告经核对未作为技术缺陷；存在少量资源与基础设施问题。 |
| **总计** | **10/20** | **优先处理键盘可用性与窄窗口可达性。** |

共 **13 项问题：P0 0 项、P1 4 项、P2 7 项、P3 2 项**。分级按用户影响，不按扫描警告数量。

最应优先处理的四项：

1. 模态对话框的焦点可以进入背景，并且关闭后不能可靠返回触发按钮。
2. 主按钮普通文字的对比度不足。
3. 框选截图只有指针绘制路径，键盘用户没有等效操作入口。
4. 窄窗口下顶部主要操作被裁切，影响进入设置、选择工作区和调整布局。

## 范围、方法与证据边界

项目只有一个浏览器应用入口，没有独立的多路由页面系统；“全部页面”按功能界面与状态覆盖。

| 界面 / 状态 | 检查范围 |
|---|---|
| 连接、欢迎页、启动错误 | 源码；欢迎页桌面及 320px 截图。 |
| 工作区选择器、最近工作区、目录树与会话侧栏 | 源码；选择工作区流程、Tab 焦点及布局测量。 |
| 三栏工作台、侧栏开关、布局预设、分割线、工作栏菜单 | 源码；桌面与窄窗口、纵向布局、正文缩放、短窗口菜单、键盘及合成触摸操作。 |
| 文件标签、Markdown、PDF、Word/PPT、图片、纯文本、未知格式、处理错误 | 全部预览组件源码；Markdown/PDF、Office 处理状态、未知格式及损坏文件截图。独立图片/纯文本预览未单独做浏览器流程。 |
| 文档记忆说明、状态、页记忆查看与重建 | 全组件源码与 PDF 页面的初始状态；未调用真实视觉模型，不宣称已验证记忆完成后的所有状态。 |
| 主对话、临时分支、输入、授权、来源、选区预览、生成文件入口 | 全部源码；本地演示回答、来源显示、缩放与活跃区域语义检查。 |
| 设置：截图快捷键、模型连接、输出目录、插件 | 四个面板桌面及 320px 截图；200% 文字尺寸模拟。 |
| 插件卡片、工具预览、外部 MCP、插件扩展视图 | 全部源码与插件设置面板；没有启动外部 MCP 或新增插件工具调用。 |
| 选字菜单、文档截图遮罩、截图预览、屏幕捕获提示 | 全部源码；选区菜单、指针框选和预览。没有捕获用户桌面或执行系统屏幕授权。 |
| 语音准备、录音、识别、错误及草稿恢复 | 全部源码；未下载模型、开启真实麦克风或进行语音实测。 |

实测环境：Windows、Node.js 24.21.0、Playwright Chromium **156.0.8078.4**，本地隔离服务，合成工作区。浏览器无外部 HTTP 请求，真实模型调用为 **0**。

- 主检查视口：1600×1000、1024×800、768×800、390×800、320×800；另检查 1024×256 短窗口。
- 320 CSS px 用于窄窗口及重排压力测试，可代表 1280px 宽桌面在 400% 缩放下的等效布局宽度；**未实际操作浏览器 400% 缩放**。桌面 Web 同样需要考虑重排，不因此新增原生移动端交付要求。[W3C 重排说明](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)
- 正文 200% 使用产品自身缩放功能。设置文字 200% 是审计期间临时倍增计算字体尺寸的模拟，不是系统文字设置或真实浏览器文字缩放；该模拟下设置面板可纵向滚动，未发现横向溢出。
- 触摸证据来自 Chromium CDP 合成 touchStart/touchMove/touchEnd/touchCancel，**不是物理设备验收**；未测试 Safari、Firefox、iOS、Android 实机和系统触控辅助技术。
- 浏览器加载现有 `apps/web/dist` 产物；应用源码另做静态检查。未重建发布产物；现有 JS 产物时间晚于所检查的 App/Workbench 源文件，但这不代替完整的源码与发布产物一致性证明。
- 本次没有 axe、Lighthouse 全套扫描、网络/CPU 限速、多次统计、NVDA/VoiceOver 实测或生产用户数据。不能把本地低延迟样本视为真实设备的性能保证。
- 未配置本次隔离实例的 LibreOffice，Office 截图只代表处理提示/状态检查，**不宣称完成 Word/PPT 原版成功预览验收**。

原始证据：[主浏览器记录](evidence/browser-audit.json)、[针对性复核](evidence/focused-audit.json)、[检测器结果](evidence/detector-findings.json)、[文件与资源指纹](evidence/provenance.json)。共保存 29 张截图；主要结果在下面各项引用。

## P1：发布前应优先处理

### A01 — 模态焦点与声明不一致

- **位置**：[SettingsDialog.tsx:10](G:/My_project/try/apps/web/src/workbench/SettingsDialog.tsx:10)、[WorkspacePicker.tsx:7](G:/My_project/try/apps/web/src/workspaces/WorkspacePicker.tsx:7)、[CapturePreview.tsx:2](G:/My_project/try/apps/web/src/capture/CapturePreview.tsx:2)。
- **分类 / 证据**：无障碍；设置及工作区选择器已浏览器复现，截图预览的共同实现缺口由源码确认。
- **复现**：打开设置后，焦点仍在背景“打开设置”按钮；42 次 Tab 中 24 次落在设置对话框外，包括文件栏、下载及截图按钮。工作区选择器虽然有自动焦点，42 次 Tab 中也有 2 次离开对话框。关闭设置后焦点落在 `BODY`。
- **影响**：键盘操作和模态视觉状态脱节，用户可能操作被遮住的背景，也可能在关闭弹层后丢失位置。
- **标准**：模态角色已经声明为 `aria-modal=true`，但没有实现背景不可交互、焦点进入/循环/返回。[W3C 模态对话框模式](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- **建议**：采用共享的原生 dialog 或经过验证的模态基础组件，统一进入焦点、Tab 循环、背景 inert、关闭及焦点恢复。不要仅补一个 `aria-modal` 属性。
- **建议命令**：`$impeccable harden 设置与工作区弹层的键盘及焦点行为`。

### A02 — 主按钮文字对比度不足

- **位置**：[tokens.css:1](G:/My_project/try/apps/web/src/styles/tokens.css:1) 的 `.primary` 与 `.primary:hover`；[workbench.css:1](G:/My_project/try/apps/web/src/styles/workbench.css:1) 的 `.composer-hint`。
- **分类 / 证据**：无障碍；计算样式与 sRGB 相对亮度公式核对。
- **实测**：12px 白色“保存设置”文字 / `#557fd6` 背景为 **3.89:1**；hover 背景 `#648fe7` 为 **3.17:1**。8px 输入提示 `#718094` / `#15181d` 为 **4.42:1**。
- **影响**：低视力读者难以辨认关键动作和操作提示。不能因文字较小而降低要求，也不能把纯图标的 3:1 要求套到按钮文字。
- **标准**：普通文字 AA 最低 4.5:1；上述样本不足。[W3C 文字对比度](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- **建议**：针对默认、hover、focus 状态调整前景/背景配对，保持既有蓝色身份；逐对计算，不用增加阴影代替对比度。
- **建议命令**：`$impeccable colorize 主按钮及操作提示的可读性`。

### A03 — 键盘用户无法完成矩形截图选区

- **位置**：[CaptureOverlay.tsx:2](G:/My_project/try/apps/web/src/capture/CaptureOverlay.tsx:2) 及第 3 行指针处理。
- **分类 / 证据**：无障碍；源码与浏览器复现。
- **复现**：点击截图按钮后，遮罩内可聚焦控件数量为 **0**；按方向键没有创建或改变选区。快捷键只能进入遮罩，实际框选需要 pointerDown/move/up。Esc 取消有效，但没有完成截图的键盘替代。
- **影响**：不能使用鼠标或触摸的用户无法向临时对话提供局部截图。
- **标准**：矩形范围由起止点决定，不依赖自由绘制的路径；需要等效键盘操作。[W3C 键盘操作](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html)
- **建议**：让遮罩可接收焦点，支持键盘移动/调整选区及确认，或提供可输入范围/截取当前页的等效入口，同时保留现有 Esc。
- **建议命令**：`$impeccable harden 截图框选的键盘等效操作`。
- **截图**：[截图遮罩](evidence/capture-overlay-1600.png)。

### R01 — 窄窗口工具栏操作裁切

- **位置**：[workbench.css:1](G:/My_project/try/apps/web/src/styles/workbench.css:1)：`.workspace-sidebar`、`.app-shell`、`.workbench-toolbar`、`.toolbar-actions`；[Workbench.tsx:52](G:/My_project/try/apps/web/src/workbench/Workbench.tsx:52)。
- **分类 / 证据**：响应式；浏览器几何测量及截图。
- **复现**：320px 下侧栏保持 180px，工作台只剩 **140px**；工具栏内容宽 **338px**，超出可用宽度 **198px**。即使关闭侧栏、改用纵向布局，顶部仍超出 **18px**，右端主要操作不能完整显示。390px 也有 128px 工具栏溢出。
- **影响**：用户在窄桌面窗口或高倍缩放下难以进入布局、设置及工作区操作。这里报告的是操作可达性，不把用户主动选择三列后的工作区横向滚动一律判错。
- **标准**：重排和缩放时应保留功能；原文页图、表格等可有二维布局例外，普通顶部操作不因此自动豁免。[W3C 重排及例外](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)
- **建议**：在小宽度提供可关闭的覆盖式侧栏、可截断的工作区名称、可收纳的次要提示，确保主要操作始终可达。保留用户手动布局，不强制覆写为纵向。
- **建议命令**：`$impeccable adapt 工作台侧栏与顶部操作`。
- **截图**：[320px 默认工作台](evidence/workbench-320.png)、[320px 纵向布局](evidence/workbench-320-rows.png)。

## P2：下一轮处理

### R02 — 正文 200% 缩放放大了布局宽度

- **位置**：[ContentZoom.tsx:2](G:/My_project/try/apps/web/src/layout/ContentZoom.tsx:2)。
- **分类 / 证据**：响应式；产品自身缩放操作已复现。
- **实测**：文档区可用宽 547px，缩放后内容宽 **1094px**；主对话可用宽 407px，内容宽 **776px**。文本行需要左右滚动，不能只靠自然换行阅读。
- **原因 / 影响**：组件把父容器原始宽度直接作为内容 CSS 宽度，再施加 `zoom:2`。低视力用户放大文字后需要反复横向移动。当前有滚动绕行，不声称这是浏览器 200% 缩放实测。
- **标准**：与 WCAG 重排的可读性目标有关；PDF/图像可保留二维缩放，普通 Markdown 和对话文字应单独考虑换行。
- **建议**：将可视宽度换算为缩放后的逻辑宽度，或只放大字体并约束容器；保留 PDF 的专用缩放路径。
- **建议命令**：`$impeccable adapt 正文缩放与文本重排`。
- **截图**：[正文 200%](evidence/content-zoom-200-desktop.png)。

### R03 — 短窗口工作栏菜单超出上下边界

- **位置**：[PaneHeader.tsx:7](G:/My_project/try/apps/web/src/layout/PaneHeader.tsx:7)、[layout.css:1](G:/My_project/try/apps/web/src/styles/layout.css:1)。
- **分类 / 证据**：响应式；1024×256 窗口已复现。
- **实测**：弹层顶部 **-74px**，底部 **287px**，实际高 361px；没有最大高度或内部滚动。顶部缩放操作和底部动作不能同时完整进入视口。
- **影响**：短窗口与高倍缩放用户需扩大窗口才能顺畅设置工作栏。`innerHeight-330` 的定位估值既可为负，也不等于实际菜单高度。
- **建议**：按实际弹层尺寸进行碰撞定位，保持安全边距，限制为可用视口高度并允许内部滚动。
- **建议命令**：`$impeccable adapt 工作栏弹层的短窗口布局`。
- **截图**：[短窗口弹层](evidence/pane-popup-short-viewport.png)。

### R04 — 密集控件对触摸与放大阅读不够友好

- **位置**：[tokens.css:1](G:/My_project/try/apps/web/src/styles/tokens.css:1)、[workbench.css:1](G:/My_project/try/apps/web/src/styles/workbench.css:1)、[viewers.css:1](G:/My_project/try/apps/web/src/styles/viewers.css:1)、[voice.css:1](G:/My_project/try/apps/web/src/styles/voice.css:1)。
- **分类 / 证据**：响应式 / 无障碍；尺寸测量和截图。
- **实测**：导入图标约 **20×18px**、发送 **28×28px**、语音 **30×30px**；正文缩放比例和操作提示为 8px。320px 设置面板的导航文字逐字挤成多行；纵向布局的临时输入区底部超出工作栏约 26px，底部提示被裁切，发送按钮仍可见。
- **影响**：触摸容错低，提示难读，窄窗口设置导航需要额外辨认。不能把所有小于 44px 的控件一概认定为 AA 违规。
- **标准**：WCAG 2.2 AA 的目标尺寸检查基线是 **24×24 CSS px，且有间距等例外**；44px 可作为更舒适的触控设计目标。具体 AA 判定需逐目标测量间距，本次不作全面符合性声明。[W3C 目标尺寸与例外](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- **建议**：触控情境扩大实际点击区域；设置导航采用不拆字的换行或可滚动标签条；按内容需求计算纵向面板最小高度，保留提示与授权控件。
- **建议命令**：`$impeccable adapt 紧凑控件与设置导航`。
- **截图**：[窄窗口设置](evidence/settings-model-320.png)、[纵向布局滚到底部](evidence/rows-320-scrolled-bottom.png)。

### A04 — 普通回答流程缺少动态播报语义

- **位置**：[ChatPane.tsx:37](G:/My_project/try/apps/web/src/workbench/ChatPane.tsx:37)、[DocumentPane.tsx:20](G:/My_project/try/apps/web/src/workbench/DocumentPane.tsx:20)、[App.tsx:11](G:/My_project/try/apps/web/src/App.tsx:11)。
- **分类 / 证据**：无障碍；源码及成功演示回答后的 DOM 检查。
- **实测**：普通主对话区域内 `aria-live`、`role=status`、`role=log` 数量为 **0**；回答内容没有动态播报角色。部分其他路径已经使用 status/alert，普通加载与回答路径不一致。
- **影响**：屏幕阅读器用户可能需要自行重新寻找当前回答和加载状态。没有实机读屏测试，因此不把每个回答字符都必须播报、或所有更新均违反标准作为结论。
- **标准**：加载/完成等状态应核对 WCAG 4.1.3；回答正文与状态通知需分别设计。[W3C 状态消息](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
- **建议**：给“正在阅读/已完成/失败”提供简短、稳定的状态播报；避免逐 token 重播全文。之后用 NVDA/VoiceOver 检查顺序与重复播报。
- **建议命令**：`$impeccable harden 加载与回答状态的辅助技术反馈`。

### A05 — 标签、菜单和展开状态缺少完整交互语义

- **位置**：[FileTabs.tsx:2](G:/My_project/try/apps/web/src/workbench/FileTabs.tsx:2)、[WorkspaceSidebar.tsx:5](G:/My_project/try/apps/web/src/workspaces/WorkspaceSidebar.tsx:5)、[PaneHeader.tsx:7](G:/My_project/try/apps/web/src/layout/PaneHeader.tsx:7)、[LayoutControls.tsx:8](G:/My_project/try/apps/web/src/layout/LayoutControls.tsx:8)、[SelectionMenu.tsx:2](G:/My_project/try/apps/web/src/selection/SelectionMenu.tsx:2)。
- **分类 / 证据**：无障碍；源码确认，选区菜单焦点行为另有浏览器证据。
- **表现**：文档标签声明 tab/tablist，但没有 roving tabIndex、方向键导航和 tabpanel 关联。目录按钮没有 aria-expanded；工作栏及布局弹层触发器没有展开状态。选区菜单出现后焦点仍留在原文，菜单没有初始焦点和方向键处理。
- **影响**：辅助技术难以判断展开/当前状态；键盘用户要遍历更多控件才能进入目标菜单。现有 Tab+Enter 仍能激活很多按钮，不能因此断言所有标签功能完全无法键盘操作。
- **标准**：WAI-ARIA tabs/menu 模式及名称、角色、状态的完整性；APG 模式差异不等于自动证明每项 WCAG 违规。[W3C 标签模式](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)
- **建议**：为标签明确关联内容并实现集中焦点；为目录和弹层暴露展开/当前状态；菜单打开时进入首项并在关闭时恢复焦点。键盘触发选区菜单的探测临时给合成段落加入了 tabindex，未把它当作产品已经提供的正常焦点入口。
- **建议命令**：`$impeccable harden 标签、目录与菜单的键盘语义`。

### P01 — 欢迎页也下载完整阅读功能包

- **位置**：[main.tsx:1](G:/My_project/try/apps/web/src/main.tsx:1)、[App.tsx:2](G:/My_project/try/apps/web/src/App.tsx:2)、[DocumentPane.tsx:2](G:/My_project/try/apps/web/src/workbench/DocumentPane.tsx:2)、[MarkdownViewer.tsx:1](G:/My_project/try/apps/web/src/documents/MarkdownViewer.tsx:1)。
- **分类 / 证据**：性能；现有产物尺寸和冷上下文资源记录。
- **实测**：在选择工作区前即下载单一 JS **1,238,439 B** 和 CSS **233,376 B**，合计约 **1.40 MiB**；本地服务此次没有压缩传输。离线计算 gzip 后分别为 380,568 B 和 52,328 B，仅作为压缩潜力，不当作实际传输量。
- **原因 / 影响**：App 同步引入 Workbench，随后同步引入 PDF、Markdown/数学公式及截图功能。用户尚未打开文档，也承担这些功能的下载与解析成本。因为主要运行在 localhost，不能据此假定真实用户必然网络慢，但包解析和资源成本仍存在。
- **建议**：按工作台、PDF 阅读器、截图及设置等实际使用边界进行懒加载；保留明确加载状态。不要为了拆包改变核心阅读流程。
- **建议命令**：`$impeccable optimize 首屏与按需阅读功能加载`。

### P02 — 大型 Markdown 同步解析与渲染阻塞主线程

- **位置**：[MarkdownViewer.tsx:6](G:/My_project/try/apps/web/src/documents/MarkdownViewer.tsx:6)、[anchors.ts:4](G:/My_project/try/apps/web/src/selection/anchors.ts:4)、[ChatPane.tsx:22](G:/My_project/try/apps/web/src/workbench/ChatPane.tsx:22)。
- **分类 / 证据**：性能；合成大文档压力测试已复现，流式增长路径由源码确认。
- **实测**：2500 个小节、显示文字约 141,409 字符，产生 **37,503 个元素**；打开过程中 PerformanceObserver 记录到单次 **1790ms** 长任务。初始欢迎页此次 FCP/LCP 候选约 136ms，没有首屏长任务，因此不把大文档压力样本冒充普遍首屏性能。
- **原因 / 影响**：整篇内容在主线程完整解析和生成 DOM，源码锚点在节点遍历中反复线性查找 blocks；长文档影响输入、滚动和其他面板响应。流式回答每次 text 改变也进入完整 Markdown 渲染，但本次没有对长回答做独立吞吐基准。
- **建议**：先改善 block 定位和稳定分块，再评估解析异步化、分段渲染及长历史窗口化。流式渲染可节流并复用已完成块，同时维护来源锚点和选区正确性。
- **建议命令**：`$impeccable optimize 大文档与流式 Markdown 渲染`。

## P3：维护性与低影响问题

### T01 — 主题变量覆盖不完整

- **位置**：[tokens.css:1](G:/My_project/try/apps/web/src/styles/tokens.css:1)、[voice.css:1](G:/My_project/try/apps/web/src/styles/voice.css:1)，以及其他样式文件。
- **分类 / 证据**：主题实现；源码计数与引用检查。
- **表现**：8 个样式文件有 **157 处十六进制颜色出现**，其中 tokens 文件 18 处，其余 139 处；这是出现次数而非不同颜色数量。voice.css 两处使用未定义的 `--text`，会依赖无效值的继承回退。
- **影响**：统一调整对比度和状态颜色时容易漏改。当前是已有暗色产品，没有亮色主题承诺；不把“没有主题切换按钮”当缺陷，也不声称未定义变量已经导致不可读文字。
- **建议**：围绕文本、表面、边框、交互及错误状态建立语义变量，明确纸张预览的亮色上下文，补齐缺失引用。
- **建议命令**：`$impeccable colorize 统一语义颜色与状态配对`。

### I01 — PDF 样式中的内嵌字体被现有 CSP 阻止

- **位置**：[PdfViewer.tsx:1](G:/My_project/try/apps/web/src/documents/PdfViewer.tsx:1) 的 PDF.js viewer CSS；[static.ts:4](G:/My_project/try/apps/server/src/static.ts:4)。
- **分类 / 证据**：实现完整性；浏览器 securitypolicyviolation 事件。
- **实测**：`effectiveDirective=font-src`、`blockedURI=data`；欢迎页就出现相关控制台报错，因为 PDF 样式已经提前加载。
- **影响**：存在被阻止的辅助字体资源与控制台噪声。没有发现本文样例的 PDF 正文因此不可读，故按低影响处理，不推断所有 PDF 文字缺失。
- **建议**：检查该 PDF viewer 辅助字体是否实际需要；优先按需加载相应样式或使用同源字体资源，保持 CSP 的约束。不要为消除一条报错广泛放宽生产策略。
- **建议命令**：`$impeccable harden PDF 阅读器的资源与 CSP 配合`。

## 系统性问题与已有优点

需要集中解决的系统性问题：

- 对话框、弹层和菜单分别实现，缺少共享的焦点、定位与状态语义约定。
- 密集桌面布局同时用于窄窗口和触摸情境；手动布局功能已经具备，但关键操作没有单独保障可达性。
- 阅读功能统一同步进入首包，Markdown 解析、锚点与 DOM 渲染仍是整篇处理。
- 基础颜色变量与直接色值并存，后续可读性调整容易遗漏。

已经有效的实现应保留：

- 输入框大多有 label/aria-label，三个主要区域有可读名称，错误路径多处使用 alert。
- 全局提供 focus-visible 轮廓；输入框自身移除 outline，但 composer 的 focus-within 边框提供另一种反馈，不能简单报告“所有输入没有焦点样式”。
- 分割线具备 separator 语义、数值状态及方向键操作；键盘 ArrowRight 将比例从 45 改为 47。
- 分割线使用 `touch-action:none`、指针捕获及 pointerCancel；合成触摸将比例从 40 改为 45，取消后鼠标移动没有继续改变比例。物理触控仍未验收。
- PDF 使用 IntersectionObserver 和清理逻辑；30 页合成 PDF 只渲染 2 个画布，其余 28 页保留占位。
- 已有 reduced-motion 分支；模拟偏好后没有持续 CSS 动画，文本加载状态仍保留，不把取消装饰性旋转认定为状态丢失。
- 表格、代码、公式有各自溢出处理；引用文本、版本与来源信息实际存在。
- Markdown 跳过原始 HTML、限制资源路径，插件视图禁用危险元素；未为本次审计放宽 CSP。
- 临时生成文件授权保留明确的逐次复选入口；语音先成为可编辑草稿，源码有取消和资源释放路径。

## 建议处理顺序

本次没有执行下面的修改。

1. **P1 — `$impeccable harden`**：先处理模态焦点、键盘截图，再补状态与标签语义。
2. **P1 — `$impeccable colorize`**：修复主按钮和提示文字的实际对比度，随后集中语义颜色。
3. **P1/P2 — `$impeccable adapt`**：确保窄窗口顶部操作可达，修复正文缩放、短窗口菜单及紧凑控件。
4. **P2 — `$impeccable optimize`**：拆分首屏包，解决大 Markdown 主线程长任务，再检查长回答和长历史。
5. **P3 — `$impeccable harden`**：处理 PDF 辅助字体与 CSP 的资源一致性。
6. 修复后重新运行 **`$impeccable audit`**，补充 NVDA/VoiceOver、真实浏览器缩放和物理触控验收。
7. 最后运行 **`$impeccable polish`**，检查修复后的交互与布局一致性。

可以逐项、一起或按你指定的顺序处理这些问题；修复后重新审计以比较评分与证据。本报告不会触发修改。
