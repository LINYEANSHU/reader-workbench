# EditHere 两处界面修改验证

反馈：`reader-workbench-519a8ec7-e447-45cf-b51b-9fb9f1371f7a.json`，EditHere 0.11.1 成功回执，2 条批注。用户确认统计范围为当前工作区全部主对话与临时追问。

- 原对话栏下方统计移到工作台底栏；点击查看累计输入、输出、回传覆盖、缓存及当前两栏各自的上下文。
- 工作区汇总读取模型用量主记录，包含历史连接配置；不重复累加会话索引。缓存命中率按实际已回传的输入 token 加权。缺失用量保留未知或下限提示，读取失败保留上次结果并提示重试。
- 文件栏添加禁用的“一键翻译”按钮，提示“即将推出”，本次没有接入翻译请求。

验证结果：

- `npm run typecheck`：通过。
- `npm run build`：通过；Vite 保留原有体积提示。
- `npm test`：138 通过、2 跳过。首次执行的 3 项 Office 检查因默认目录没有 LibreOffice 失败；仅为重跑进程设置 `READER_LIBREOFFICE` 指向已存在的 `.worktrees/reader-workbench/.reader-runtime/LibreOffice/program/soffice.com`，全量重跑通过。
- 相关浏览器检查共 5 项通过：`agent-settings.spec.ts` 2 项、`model-usage.spec.ts` 2 项、`workspace-statistics.spec.ts` 1 项。新增底栏检查覆盖历史主对话与临时追问合计、切换/新建会话后保持总量、缓存加权、上下文分别展示、Escape 关闭并恢复焦点、翻译入口禁用和接口失败时保留统计。
- 界面截图：`workspace-statistics-1600.png`、`workspace-statistics-768.png`、`workspace-statistics-320.png`。320px 检查先收起现有覆盖式侧栏；三个尺寸均检查了统计区域与详情边界。
- Impeccable 对本次 5 个界面文件执行一次机械扫描：退出码 0，结果 `[]`。
- `git diff --check`：通过；保留已有工作区改动，没有提交或推送。

截图来自本地协议测试模型及临时测试工作区，示例 token 数不是用户真实账户用量。现有 4317 服务进程没有重启；使用新增汇总接口需要重启工作台并刷新页面。
