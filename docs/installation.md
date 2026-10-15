# 安装与运行

需要 Node.js 24 或更新版本。Windows、macOS 和 Linux 使用相同的本地 Web 服务；默认仅监听 `127.0.0.1:4317`。

发行包安装后，日常使用一条命令：

```sh
npm install --global /path/to/reader-workbench-0.3.0.tgz
reader-workbench web
```

安装路径中有中文或空格时，将包路径放在引号内。包包含 CLI、Web/PDF/语音资源、插件示例与 SDK 声明；运行不需要链接源码工作区。

源码开发安装：

```sh
npm ci
npm run build
npm start
```

应用打开后先选择实际工作区，然后在设置中配置兼容 OpenAI Chat Completions 的 Base URL、模型和 API Key。主对话与临时对话分别选择思考深度；临时对话不会写入主对话。生成文件保存在所选工作区的 `outputs` 目录，配置与凭据存放于本机用户配置目录。

## 内置语音

两个对话输入框均有麦克风按钮。首次点击会自动下载并校验约 240 MB 的 SenseVoiceSmall INT8 模型，之后在本机使用；不用配置语音 API、安装 Python 或手动启动识别服务。下载失败可以重试，未通过固定大小与 SHA-256 的内容不会启用。缓存位于用户配置目录的 `speech/sensevoice-small-int8`；`READER_SPEECH_ASSET_DIR` 可指定已准备好的本地缓存。

允许浏览器访问麦克风后，录音栏显示计时与波形。点击停止会在本机识别，文字进入可编辑输入框，按发送才调用 LLM。录音期间修改过输入框时，转写保存在独立恢复框，可复制或追加。Esc、取消、隐藏页面、折叠录音栏或切换工作区会停止录音。单次最多 120 秒；原始录音不落盘。

运行库固定为 sherpa-onnx-node 1.13.8，应用自动配置受管理识别进程所需的动态库路径。提供 Windows x64、macOS arm64/x64、Linux arm64/x64 原生依赖；本轮实际验收在 Windows x64，其余平台仍需真实机器或 CI 验证。浏览器必须支持安全上下文中的 getUserMedia 和 AudioWorklet。

模型来源：FunAudioLLM SenseVoiceSmall；ONNX 转换：csukuangfj/sherpa-onnx。固定版本与两个资源的哈希见 `packages/core/src/speech/assets.ts`。模型权重遵循 [FunASR 模型协议](https://github.com/modelscope/FunASR/blob/main/MODEL_LICENSE)，代码的 MIT 许可与模型协议分别处理；[原始模型声明](https://huggingface.co/FunAudioLLM/SenseVoiceSmall)及 [sherpa-onnx Apache-2.0 许可](https://github.com/k2-fsa/sherpa-onnx/blob/master/LICENSE)见第三方说明。

## Office 页面

Markdown 和 PDF 可直接读取。DOC/DOCX/PPT/PPTX 原版页面预览需要本机 LibreOffice；应用自动发现 PATH、Windows 标准安装路径或 macOS Applications。也可设置 `READER_LIBREOFFICE` 指向 `soffice` 可执行文件。原文件保留；转换可能受本机字体影响。

Windows 安装 LibreOffice 后，默认发现 `C:\Program Files\LibreOffice\program\soffice.com`；macOS 将 LibreOffice.app 放入 `/Applications`；Linux 安装包含 `soffice` 或 `libreoffice` 命令的 LibreOffice 软件包并使其出现在 PATH。中文文档需要相应中文字体。安装后运行 `reader-workbench doctor` 检查可用性，检查本身不会下载语音模型。

转换使用自动清理的系统临时目录作为私有 staging 与 LibreOffice profile，避免深工作区路径导致其内部配置失败；持久预览和文档缓存仍在原工作区中，生成文件仍在 `outputs/<session>/`。

```sh
reader-workbench doctor
reader-workbench web --port 4317
reader-workbench mcp --config-dir /path/to/private/config
```

CLI MCP 桥接连接已运行的 Reader 服务，并使用同一工作区和会话。见 [HTTP API](api.md)、[MCP Server](mcp.md)、[插件/Python 工具](plugins.md)与[验收说明](verification.md)。
