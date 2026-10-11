## Task 16: 内置 SenseVoice 离线语音输入

**Files:** Create `packages/contracts/src/speech.ts`；`packages/core/src/speech/{service,assets,wave}.ts`；`packages/core/src/speech/worker.mjs`；`apps/server/src/routes/speech.ts`；`apps/web/src/voice/{recorder,VoiceInput}.tsx`；`tests/integration/speech.test.ts`、`tests/unit/wave.test.ts`、`tests/e2e/voice-input.spec.ts`；`scripts/voice-smoke.mjs`。Modify capability SDK、server/CLI/build、task 9 composers、安装文档和 evidence manifest。

**Interfaces:** SpeechProvider 提供本地 processingLocation、支持语言、prepare(signal,onProgress)、transcribe(audio,language,signal)、dispose。SpeechService.catalog/prepare/transcribe/cancel 使用同一认证与工作区/会话所有权；transcribe 返回 text/audioSeconds/inferenceSeconds，不写 Session。Model asset manifest 固定 URL/大小/SHA-256。运行库固定 sherpa-onnx-node 1.13.8。默认 INT8 SenseVoiceSmall 模型 239233841 bytes；sha256 c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51；tokens 315894 bytes/sha256 f449eb28dc567533d7fa59be34e2abca8784f771850c78a47fb731a31429a1dc。

- [ ] **Step 1:** 写 WAV 和服务测试。有效 16 kHz PCM16、坏头/超长/越界、取消/超时、队列、准备损坏文件重试、所属会话验证、不写父历史。先运行 `npm test -- tests/unit/wave.test.ts tests/integration/speech.test.ts`，预期缺实现失败。
- [ ] **Step 2:** 实现资产准备和受管理子进程识别，真实安装 npm 平台运行库并检查导入。模型下载到本机、逐文件哈希一致；真实生成的中文/英文语音得到合理转写，阻止外网访问后仍成功，不能以模拟输出充当本地模型证据。
- [ ] **Step 3:** 接入任务 9 的两个 composer，PCM16 转换、录音波形与计时、停止/取消和 stale draft 保护。实际跑浏览器麦克风授权及录音按钮；浏览器测试使用真实音频输入设备替代可重放测试样例，拒绝权限保留草稿。
- [ ] **Step 4:** 运行 named tests、typecheck/build、真实 `scripts/voice-smoke.mjs` 和 `tests/e2e/voice-input.spec.ts`。未运行的平台单列。包内可携带预下载模型或自动准备，用户不需配置语音 API、安装 Python 或手动启服务。
- [ ] **Step 5:** Commit `feat: embed offline SenseVoice dictation`。记录服务端、浏览器测试与模型实证，任务 15 补充发行资源的后续消费者证据。

## 需求到实现及证据的映射（含追加项）

| ID | 实施任务 | 核心证据 |
| --- | --- | --- |
| R01 | 1、9、15 | CLI 发行启动、HTTP、实际浏览器 |
| R02 | 1、4、15 | 平台矩阵及真实日志，未测平台明确标记 |
| R03 | 10 | 六种排序、分隔线、刷新恢复截图 |
| R04 | 4、9、15 | 四类含图表公式样例、旧 DOC/PPT 真实转换及页面 |
| R05 | 2、4、8 | 源 SHA-256、新旧版本缓存 |
| R06 | 7、9、15 | 真实 API 主/临时流式输出；模拟单列 |
| R07 | 5、6 | 最新 mainRevision、完整追问链、每次 envelope |
| R08 | 3、5、6、11、12、14 | 父消息/revision/summary/tool-state 前后哈希 |
| R09 | 4、7、9、11、12 | 锚定选区、图像能力、引用定位 |
| R10 | 4、5 | 大文档全文索引、摘要覆盖、原记录查询 |
| R11 | 8、9、15 | 四格式生成、来源、真实重新预览 |
| R12 | 3、14 | 插件注册/调用/设置/界面/停用 |
| R13 | 13 | 独立 HTTP/MCP 客户端，共享同一状态 |
| R14 | 3、14 | 外部 stdio/HTTP 工具、断连、临时写权限拒绝 |
| R15 | 1、4、5、6、7、9、15 | 持久化恢复、取消/失败/幂等/重启 |
| R16 | 1、2、3、7、9、13 | 认证、边界链接、文档脚本、凭据脱敏 |
| R17 | 2、4、8、9、12 | 工作区优先、原件原位、输出/截图/A→B 归属 |
| R18 | 10、11、12 | 独立 50–200% 正文缩放、选区/截图坐标 |
| R19 | 10 | 三列/三行/四混合、自定义、宽/窄窗口 |
| R20 | 11 | 四类文字实际左选/右询、临时答案 |
| R21 | 7、12 | 绑定冲突、DPR 像素、取消和实际屏幕授权 |
| R22 | 9、15 | 官方视觉参考及成品浏览器截图核对 |
| R23 | 14 | 真实 Python 进程注册/调用/取消/作用域 |
| R24 | 7、9、15 | 实际 reasoning_effort、协议 thinking 参数、两栏独立选项、在途冻结 |
| R25 | 16、9、15 | 模型固定哈希、真实离线识别、麦克风/草稿/取消、发行资源 |

## 计划自审与交接

- 已逐项对照规格 1–18 节及 R01–R23；上述表中每项都有实现任务和证据。
- 每个任务有一个独立可验证交付，配置/脚手架/说明归入需要它的任务，没有单独的空壳任务。
- 模型/插件/界面不会写另一份 Agent 逻辑；共享 ID、来源、RunScope、AskRequest 和 revision 名称一致。
- Review Focus 五项已加到拥有相应代码的任务测试中。
- 代码块只描述关键断言/签名，不预先抄写实现；所有业务成功须以实际文件/进程/接口/浏览器证据确认。
- 当前仅规格和计划已编写，尚未执行这些代码任务；勾选框表示未来验证状态，不代表已通过。

建议 **Native**：由当前会话顺序实现，再在末尾进行独立全分支审查。15 个任务共享同一组工作区、来源和会话契约，连续实现有利于保持一致。若用户更重视每个任务都独立审查，可选 **Subagent-driven**，由新实现者和新审查者逐任务推进；会使用更多上下文。收到书面计划审阅和执行方法选择后，才进入实现。

## 实施资料核对记录

- [MCP TypeScript SDK 官方仓库](https://github.com/modelcontextprotocol/typescript-sdk)：2026-10-11 核对到稳定 v2，使用分包 server/client/fastify；v1 包路径不能混用。
- [Vite 官方入门](https://vite.dev/guide/)：安装时核对 Node 与浏览器支持并锁定依赖。
- [Node SQLite 文档](https://nodejs.org/api/sqlite.html)：仅使用本机 Node 24 实际存在的 API；当前官网最新 Node 文档不能代替 Node 24 测试。
- [PDF.js](https://github.com/mozilla/pdf.js)：服务器解析、浏览器 canvas/TextLayer 和 worker 必须锁同一版本。
- [html-to-image 原始仓库](https://github.com/bubkoo/html-to-image)：DOM 到图像提供接口；字体、资源和 CORS 能力以实际浏览器测试为准。
- [DeepSeek Harness 官方页面](https://www.deepseek.com/en/harness/)：已核对页面资料；本轮浏览器参考工具启动失败，尚未完成视觉截图核对，此项在任务 9 开始界面实现前补做。
