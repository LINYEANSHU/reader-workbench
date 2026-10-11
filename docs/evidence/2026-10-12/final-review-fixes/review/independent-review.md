# 独立审查记录

审查人：`/root/final_review`，沿用当前模型；审查 HEAD：`817ca70bdc909a8b82d1f1c193520c3053cc79ff`；范围：`ec35e39..817ca70`。仅一次独立全分支审查，未调用真实 API、读取凭据、改动 checkout 或启动额外服务。

审查确认了分层、工作区边界、不可变版本、固定运行归属、受控工具作用域、独占文件发布、主临时记忆隔离、插件租约和语音生命周期实现。已有 core 96/96、browser 26/26 的日志、32 项证据及 10 项运行指纹匹配。历史真实 API 与当前未测项区分清楚。

无 Critical。审查结论：**With fixes**，当前 HEAD 不宜直接合并。

## Important

1. **P1 无凭据 MCP 无法从设置连接**。`external-mcp.ts:37,45` 的 configure 无条件创建 credentialRef，activate 随即要求该凭据存在。纯内存复现 stdio/HTTP 均 `CREDENTIAL_REQUIRED`。修复应允许无令牌服务、编辑保留凭据，并经管理器验证实际 stdio/HTTP 与重启恢复。
2. **P2 流结束到轮次提交之间取消仍写历史**。`runs/service.ts:46,49` 最后检查在 citation 持久化前，后续 await 与 completeOwnTurn 未检查信号。延迟 citation、abort、释放后复现 completed 且 completedTurnsWritten=1。须检查原子提交边界，验证取消不新增完成轮次、不改 revision/父记录，并明确提交后的完成语义。
3. **P2 Web 临时普通/选区/截图都默认写文件**。`ChatPane.tsx:31` 和 `Workbench.tsx:31,33` 固定 allowArtifactWrites:true，违反已批准的默认只读和显式生成操作。应默认 false，仅用户明确选择本次生成才开启；模型未经授予请求写文件应被拒绝。
4. **P2 首次提交响应丢失后重试重复提问/输出**。`ChatPane.tsx:31` 点击发送均生成 UUID，成功收到202前不保存 run/request。应 POST 前持久保存稳定请求ID及快照，重试和刷新复用；本机 fixture 丢弃首响应验证只有一个 run、一个完成轮次和一份文件。选区和截图也使用同一机制。
5. **P2 Markdown 中文名、空格、引用图片丢失**。`documents/service.ts:66` 简单正则未解析引用图片/角括号，原Unicode键不匹配 React Markdown 规范化的编码URI。实际渲染库验证 `assets/图.png` 请求成 `assets/%E5%9B%BE.png`，角括号空格路径被截断，引用式图片没有快照。应解析图片节点、统一URI、保持边界并安全修复旧ready映射；验证实际像素和截图。
6. **P2 临时多分支没有 Web 创建/切换入口**。`Workbench.tsx:21,28` 总选第一分支，侧栏只列主会话。须支持同一父会话下多分支，持久选择，保留各自草稿、历史、滚动和运行状态，且父记录不变。
7. **P2 整体复制/移动工作区返回旧身份和绝对缓存路径**。`workspaces/service.ts:33`、`workspace-store.ts:103`、`documents/service.ts:36`：新路径WSID变化，但复制数据库ready记录早退旧ID。实际SQLite内存复现返回old-workspace，新作用域 parsed 报 DOCUMENT_UNAVAILABLE。应隔离/迁移存储归属，保留旧元数据，不能只改ID而保留旧绝对路径；整体复制实际fixture验证 B 阅读、提问、输出正确，A记录/文件不变。

## Reviewer Minor

1. **P3 普通 UI 保存使用 keepalive，约64KiB以上草稿停止持久化**。`client.ts:45` 与 `Workbench.tsx:16`。服务允许1MiB状态，但浏览器keepalive总量约64KiB，约2.2万中文字及状态即可失败。建议普通定时保存不使用keepalive，卸载仅对合适大小尝试；长草稿刷新回归。审查未打开浏览器实测这一项。

执行者重分级：实际 Chromium 回归复现 25000 中文字草稿刷新后丢失，属于用户内容丢失，升级 **Important** 并进入同一唯一修复轮次；不是延后润色项。

## Declined to judge

- 当前真实 DeepSeek 可用性及最终真实 API / reasoning effort 重验：用户明确禁止；历史实测不能证明修复后当前可用性，诚实标记未测不构成虚假完成。
- macOS/Linux 原生启动、转换、语音及平台行为：当前仅有 Windows 环境，YAML 不作成功证据。
- 物理麦克风、手动 OS 屏幕选择器、可选全局 helper 人工体验：没有人工设备/已安装 helper 实证，不由 fixture 推断。
- Android/iOS 原生客户端和恶意本机插件的 OS 级隔离：规格排除，不列为本次缺陷。

执行者接受七项 Important 的实际影响，补各自 RED→GREEN 回归；升级长草稿项后共八项。修复后完整套件必须重新通过，不派第二次审查。未测行为和授权边界继续公开保留。
