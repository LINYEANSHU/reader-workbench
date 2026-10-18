# 本地中英翻译引擎部署与验证记录

日期：2026-10-18。部署平台：Windows x64。此记录覆盖本地引擎、进程桥、安装脚本；界面与服务器接线由主任务另行验证。

## 已部署位置

运行时目录为仓库根目录的 `.reader-runtime/translation/`，已受 `.gitignore` 的 `.reader-runtime/` 排除。翻译过程中使用此目录内的独立解释器、依赖和模型，不依赖系统 Python、模型 API 或用户配置的模型服务。

```text
.reader-runtime/translation/
  python/python.exe
  python/python312._pth
  site-packages/
  models/en_zh/{model/,sentencepiece.model,metadata.json,README.md}
  models/zh_en/{model/,sentencepiece.model,metadata.json,README.md}
  ready.json
plugins/document-translation/local-worker.py
```

部署时实测磁盘文件总大小为 **324,378,014 字节（约 309.35 MiB）**，共 2,402 个文件，包含官方模型包随附但推理不加载的 Stanza 小型分词资产。未安装 PyTorch、完整 Argos Translate 或在线模型客户端。

## 引擎与来源

| 组件 | 固定版本 / 方式 |
| --- | --- |
| Python | 官方 Windows x64 embedded 3.12.10，运行时私有解释器 |
| CTranslate2 | 4.6.3，CPU、`int8`，最多 4 个线程 |
| SentencePiece | 0.2.1，直接使用各模型的 `sentencepiece.model` |
| NumPy | 2.2.6 |
| PyYAML | 6.0.2 |
| setuptools | 80.9.0 |
| OpenCC Python | opencc-python-reimplemented 0.1.7，离线 t2s 简体规范化 |
| 英文到中文模型 | 官方 Argos `translate-en_zh` 1.9，底层 OPUS-MT |
| 中文到英文模型 | 官方 Argos `translate-zh_en` 1.9，底层 OPUS-MT |

模型目录内原始 README 保留了 OPUS-MT 作者信息与 **CC-BY 4.0** 许可说明；模型元数据也保留。依赖自身的许可文件位于私有 `site-packages` 中。

来源：

- [CTranslate2 官方安装文档](https://opennmt.net/CTranslate2/installation.html)，说明 CPU/Python 运行时与 Windows 轮子支持。
- [Argos 官方模型索引](https://raw.githubusercontent.com/argosopentech/argospm-index/main/index.json)，按 `from_code`、`to_code` 与固定版本 1.9 选择两个模型。
- [Argos 官方 tokenizer 实现](https://raw.githubusercontent.com/argosopentech/argos-translate/master/argostranslate/tokenizer.py)，确认 `encode(..., out_type=str)` 与 `decode_pieces` 的 SentencePiece 用法。
- [Python 3.12.10 官方 embedded 包](https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip)。

本次索引中的 `argos-net.com` 下载未成功，安装器随后从 Argos 的 `data.argosopentech.com` 官方数据镜像下载同名 1.9 包，实际 URL 与 SHA256 均记录在 `ready.json`。安装器已经固定 Python 压缩包及两个模型压缩包的 SHA256；不匹配时不会发布完成标记。安装器的后续依赖下载显式使用官方 PyPI。首次部署时 pip 使用了此机器已有的清华 PyPI 镜像配置，安装的版本与上表相同。

| 资产 | 实际下载 URL | SHA256 |
| --- | --- | --- |
| Python embedded | `https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip` | `4acbed6dd1c744b0376e3b1cf57ce906f9dc9e95e68824584c8099a63025a3c3` |
| en_zh 1.9 压缩包 | `https://data.argosopentech.com/argospm/v1/translate-en_zh-1_9.argosmodel` | `433e7c4f034d87fbe2353161e05f18646d7999452f801a4e1f0378522b9850ab` |
| zh_en 1.9 压缩包 | `https://data.argosopentech.com/argospm/v1/translate-zh_en-1_9.argosmodel` | `62e7af5a3a48b530e47b7b3e5c78c2de79073ecd815750d2bf3ab35b4a67da2d` |
| en_zh 解压后 model.bin | 本地 `models/en_zh/model/model.bin` | `1a039114d9456b6528fabb65b455b6f156319634a0f984b1f6018f7737d67598` |
| zh_en 解压后 model.bin | 本地 `models/zh_en/model/model.bin` | `edd8c8a6863d36959613ff291074627a1635fab2f51b872ef437e924d238921a` |
| en_zh SentencePiece | 本地 `models/en_zh/sentencepiece.model` | `872224b85a11edc9d769a94949fd387b67ea85b50708db9f91f32f5b497a9af3` |
| zh_en SentencePiece | 本地 `models/zh_en/sentencepiece.model` | `72600ea476b3e3b76763919c3a30ef5104d9b473b19567d45251f56034264f54` |

安装脚本为 `scripts/setup-local-translation.ps1` 与 `scripts/setup-local-translation.py`。首次安装使用已有的 Python 3.12 作为下载和 pip 引导解释器，例如：

```powershell
./scripts/setup-local-translation.ps1 -Python '<现有 Python 3.12 的 python.exe>'
```

本机已完成安装，不需再次执行。安装后，翻译运行使用目录内私有解释器；引导 Python 无需参与后续翻译。安装器在旁侧临时目录完成解压、路径校验、版本安装、模型哈希校验和依赖导入检查，最后原子重命名目录发布 `ready.json`。安装失败时保留诊断目录，不覆盖已有运行时。

## 主程序接口与离线边界

`packages/core/src/translation/local-provider.ts` 导出：

- `LOCAL_TRANSLATION_PROVIDER_ID = 'core.local-translation'`：使用保留的 `core.` 前缀，防止用户配置的远程模型遮蔽本地提供者。
- `createLocalTranslationProvider({runtimeDirectory, workerPath})`：`ModelProvider`，`vision=false`、`tools=false`、`contextWindow=1_000_000`。
- `getLocalTranslationStatus(options)`：检查完成清单、工作进程脚本、解释器、两个模型二进制及 tokenizer 的存在情况。

仅接受两个消息的 `DOCUMENT_TRANSLATION_BLOCKS` 协议：系统消息以该标记加换行开头，最后用户消息为 `{targetLanguage,blocks:[{id,text}]}` JSON。只支持 `简体中文` 与 `English`。其他目标、重复或无效 ID、空文本、工具请求和普通聊天请求均失败，不降级到远程提供者。

stdin 输入总量不超过 1 MiB，每批最多 512 块，单块文本不超过 64 KiB；stdout 不超过 16 MiB。进程执行使用原生 `spawn`、`shell:false`、隐藏窗口、独立 argv，单批最长 10 分钟。取消会终止本次请求创建的 Python 子进程。返回编号和全部 `__RW_KEEP_n__` 标记均在 Node 侧再次校验；用户可见引擎错误带 `TRANSLATION_LOCAL_ERROR`。

工作进程仅从本地加载模型。推理前注册 Python audit hook，禁止 DNS、socket connect、bind 与 sendto；程序中没有 HTTP 请求或模型自动下载逻辑。实测 DNS 与 socket connect 两项主动尝试都在连接前被拒绝，正常模型推理在同一防护下成功。此验证针对工作进程的 Python 网络入口；未声称运行了独立的操作系统防火墙/抓包审计。

对每个片段按是否含汉字判断源语言；同目标语言片段原样保留。所有保护标记在模型外拆分并按原顺序拼回；原始片段两端空白保留。数字、换行、行内代码和行内数学也在模型外保留。长句按本地规则拆分，单次 SentencePiece 输入设明确上限且关闭 CTranslate2 默认截断。模型输出的额外边缘空白只在译文内部去除，不改变输入的原始边界空白。

## 实际推理样例

以下为使用已部署私有解释器和真实模型的测试输出；未调用在线服务。

| 方向 | 输入 | 实际输出 |
| --- | --- | --- |
| English → 简体中文 | `The weather is beautiful today.` | `今日天气晴朗.` |
| 简体中文 → English | `今天天气很好。` | `It's a nice day.` |
| 保护标记与精确边界空白 | `  Hello __RW_KEEP_0__ beautiful world __RW_KEEP_1__!  ` | `  哈罗 __RW_KEEP_0__ 美丽的世界 __RW_KEEP_1__!  ` |
| 同语种原样保留 | `  这是一个测试。 __RW_KEEP_0__  `，目标简体中文 | 与输入完全相同 |
| 数学保留 | `  E = mc² + 2  `，目标 English | 与输入完全相同 |

测试发现 SentencePiece/模型的结果会增加一个前导空格。先加强断言并观察失败（输入 2 个空格，输出 3 个），再修复模型片段的去边缘空白；最终精确空白与标记顺序断言通过。活跃长文本 CPU 翻译在约 500 ms 触发取消，测试中的操作在约 505–515 ms 内以 `AbortError` 结束。

## 自动验证

专用测试文件：`tests/unit/local-translation-provider.test.ts`（5 项）与 `tests/integration/local-translation-runtime.test.ts`（5 项）。实时模型测试显式由 `READER_TEST_LOCAL_TRANSLATION=1` 启用；CI 未安装模型时会诚实跳过这 5 项。

```powershell
$env:READER_TEST_LOCAL_TRANSLATION='1'
npx vitest run tests/unit/local-translation-provider.test.ts tests/integration/local-translation-runtime.test.ts
npx tsc --noEmit
```

已观察到专用测试 **10/10 通过**；`npx tsc --noEmit` 通过；使用私有解释器执行两个 Python 文件的 `py_compile` 通过。测试先观察到了提供者缺失、工作进程缺失和边缘空白错误的 RED，再观察对应实现的 GREEN。保留提供者 ID 的新要求也先观察了断言 RED，再切换为 `core.local-translation`。

完整仓库测试结果由本记录后续追加，使用本机 LibreOffice 与真实翻译模型；前述专用结果不代替完整套件结果。

## 验证范围与已知限制

本次完成 Windows x64 的实际部署和真实 CPU 推理。其他平台没有安装模型运行时，不能据此宣称跨平台部署通过。没有提交、推送、发布或启动 GitHub Actions。

这是通用机器翻译模型；上述样例证明实际双向推理与保护机制工作，不构成专业领域翻译质量评测。中英混排按文字脚本片段处理，保留英文技术词边界；这种方式及保护标记、数字与长句拆分会减少模型上下文。保留结构与生成译文的高层文档规则仍由现有文档翻译插件承担。

## 后续完成与复核

- OpenCC 在实际译文上把 `天氣` 规范化为 `天气`，既有中文标注不会阻止相邻英文翻译。`使用Python训练模型` 的译文保留 `Python` 的单词边界。
- 文档处理器按字节与 512 块双重分批。本地提供者另兼容旧工作区仅按字节分批的处理器，接收有总字节限制的最多 4096 块，再拆为每个工作进程最多 512 块；输出仍受总体大小限制。600 块旧协议实际往返通过。
- 安装器现在验证已有模型与依赖；损坏或旧运行库不会误报已安装。显式 `-Repair` 先验证新安装，再保留旧运行库备份，发布失败会恢复原目录。当前运行库的重复安装检查实际通过。
- 翻译提供者、格式处理及真实推理相关最终专项 **31/31** 通过。新增测试先观察失败再修复。
- 完整 Vitest 执行 **229 通过 / 2 可选语音跳过**，随后旧插件兼容补充用例及受影响的全部翻译测试通过。完整套件结果文件：`.superpowers/sdd/2026-10-18-reading-controls-translation/offline-full-vitest.json`。
- npm dry-run 确认包含本地 Python 工作进程与两个安装脚本，排除私有运行目录、Agents.md 与 Python 字节码缓存。
