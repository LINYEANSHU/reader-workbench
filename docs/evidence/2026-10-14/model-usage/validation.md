# 模型 Token 用量验证记录

日期：2026-10-14（Asia/Shanghai）。

## 交付行为

- 设置 → 模型连接：打开时选择主对话当前使用的已保存连接，可切换查看其他连接。
- 用量栏下方的连接参数归入“模型配置”，默认收起，点击后展开编辑。连接选择与用量统计保持可见。
- 累计输入、输出和总 token，最近一次请求的时间、用量及完成/失败/取消状态。
- 设置页打开期间每 5 秒自动刷新，另有手动刷新；隐藏浏览器页面暂停请求，关闭设置取消计时与请求。
- 未回传、字段不完整或无效时显示未知状态；累计仅计入有效回传，不将缺失用量推算为零。
- 一次 HTTP 请求只累计最后一个有效用量快照；包含聊天、工具续答、文档页预读和概览。失败也保留已经回传的消耗。
- 本地工作区数据库保存累计统计；按配置名称、服务地址及模型名称隔离。修改模型能力不清零。未保存的模型/服务修改不显示旧模型统计。
- 不追溯此前请求，不统计其他客户端，也不查询账户余额或剩余额度。

## 验证

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run build` | 通过；已有大 bundle 警告仍在 |
| `tests/integration/model-usage.test.ts` | 5 项通过，包括并发、缺失统计、取消/失败、重启/隔离、工具续答与真实 PDF 预读流程 |
| `tests/integration/model-adapter.test.ts` | 10 项通过 |
| `tests/e2e/model-usage.spec.ts` | 2 项通过，包括当前模型选择、切换、未保存修改、刷新、读取失败恢复、三种主题与 320px 窗口 |
| Impeccable detector | 新组件、设置对话框和新增 CSS 返回 `[]` |
| `git diff --check` | 通过 |

测试先于实现运行：新增用量 API 初次返回 404，浏览器测试初次失败于设置默认选择错误连接及缺少用量区域。实现后均通过。

完整 `npm test` 首轮：127 项通过，3 项失败，2 项原生语音测试跳过。三项失败都是当前进程未找到 LibreOffice：`converts Office in a deeply nested workspace without a long LibreOffice profile`、`reads office pages and keeps versioned originals`、`reopens generated files inside the original run workspace`。仅在复跑进程中设置已有安装路径 `READER_LIBREOFFICE=G:\My_project\try\.worktrees\reader-workbench\.reader-runtime\LibreOffice\program\soffice.com` 后，文档与导出两个测试文件共 19 项全部通过。没有修改系统环境或相关产品代码。

额外运行现有 `reasoning-effort.spec.ts` 时，窄屏弹窗定位检查出现一次失败（读取到宽窗口坐标）；单独复跑同一项通过。它不是用量状态栏的验收项，也未修改该控件或测试。保留该次失败记录，不宣称整套浏览器测试稳定性已被证明。

## 视觉检查与来源

已检查 `light-1600.png` 与 `ink-320.png` 的实际截图：用量数字、刷新按钮、统计范围和模型字段可读，无横向溢出。目录另有 graphite 与其余窗口尺寸截图。数值为本地协议测试服务返回的合成数据，不代表用户真实账户的消耗；验收未调用付费外部模型，也未读取用户 API Key。

- [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)：流式 `include_usage` 与输入/输出计数。
- [OpenAI Chat Completions streaming events](https://developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events)：流式用量及中断时可能收不到最终计数的条件。

根目录构建产物已更新。已运行的服务需正常重启，再打开设置查看新状态栏。
