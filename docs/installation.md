# 安装与运行

当前维护平台为 Windows，主要验证环境为 Windows x64；macOS/Linux 已停止维护、构建和发布。需要 Node.js 24 或更新版本，默认仅监听 `127.0.0.1:4317`。

发行包安装后，日常使用一条命令：

```sh
npm install --global /path/to/reader-workbench-0.4.0.tgz
reader-workbench web
```

安装路径中有中文或空格时，将包路径放在引号内。包包含 CLI、Web/PDF/语音资源、插件示例与 SDK 声明；运行不需要链接源码工作区。

源码开发安装：

```sh
npm ci
npm run build
npm start
```

Windows 完成依赖安装和构建后，可直接双击根目录的 `Start-Reader.cmd`。启动器会自动打开浏览器，复用既有本地配置及可用的 Office、语音资源；使用期间保持窗口打开，按 `Ctrl+C` 或关闭窗口停止服务。启动失败时，窗口会保留错误提示。也可用 `Start-Reader.cmd -Port 4320` 指定其他端口；`-NoOpen`、`-ConfigDir` 和 `-Demo` 参数会传给原有 PowerShell 脚本。

应用打开后先选择实际工作区，然后在设置中配置兼容 OpenAI Chat Completions 的 Base URL、模型和 API Key。主对话与临时对话分别选择思考深度；临时对话不会写入主对话。生成文件保存在所选工作区的 `outputs` 目录，配置与凭据存放于本机用户配置目录。

模型连接、API Key、提示词、模型选择、思考档位与截图快捷键统一保存在用户配置目录的 `agent/` 中，切换工作区继续共用。Windows 默认路径为 `%APPDATA%\reader-workbench\Config\agent`。`--config-dir`（Windows 启动器的 `-ConfigDir`）可显式指定其他私有目录。

默认启动时会迁移旧项目 `.reader-runtime/user-config` 或旧工作树同名目录中的配置，在新目录 `agent/legacy/` 保存受保护备份，再移除原位置的凭据和工作区列表。若旧服务仍在运行，会提示先关闭，避免迁移期间两套服务同时改写配置。旧工作区数据库中的模型连接首次加载时迁出；同名但独立的连接保留为不同名称。工作区文件、历史、用量与输出路径仍按工作区隔离。

## 内置语音

两个对话输入框均有麦克风按钮。首次点击会自动下载并校验约 240 MB 的 SenseVoiceSmall INT8 模型，之后在本机使用；不用配置语音 API、安装 Python 或手动启动识别服务。下载失败可以重试，未通过固定大小与 SHA-256 的内容不会启用。缓存位于用户配置目录的 `speech/sensevoice-small-int8`；`READER_SPEECH_ASSET_DIR` 可指定已准备好的本地缓存。

允许浏览器访问麦克风后，录音栏显示计时与波形。点击停止会在本机识别，文字进入可编辑输入框，按发送才调用 LLM。录音期间修改过输入框时，转写保存在独立恢复框，可复制或追加。Esc、取消、隐藏页面、折叠录音栏或切换工作区会停止录音。单次最多 120 秒；原始录音不落盘。

运行库固定为 sherpa-onnx-node 1.13.8，应用自动配置受管理识别进程所需的动态库路径，当前维护和验收覆盖 Windows x64。浏览器必须支持安全上下文中的 getUserMedia 和 AudioWorklet。

模型来源：FunAudioLLM SenseVoiceSmall；ONNX 转换：csukuangfj/sherpa-onnx。固定版本与两个资源的哈希见 `packages/core/src/speech/assets.ts`。模型权重遵循 [FunASR 模型协议](https://github.com/modelscope/FunASR/blob/main/MODEL_LICENSE)，代码的 MIT 许可与模型协议分别处理；[原始模型声明](https://huggingface.co/FunAudioLLM/SenseVoiceSmall)及 [sherpa-onnx Apache-2.0 许可](https://github.com/k2-fsa/sherpa-onnx/blob/master/LICENSE)见第三方说明。

## 本地中英翻译

一键翻译默认选择离线 CPU 引擎，无需翻译模型或 API Key。源码与发行包不包含私有 Python 和模型；新机器需要先运行安装脚本，或复制与操作系统兼容的完整运行库。引擎未准备好时，界面提示安装，也可切换到“已配置的 AI 模型”。推理不联网，安装下载需要联网。

新机器上用 Python 3.12 执行 `./scripts/setup-local-translation.ps1 -Python <Python3.12可执行路径>`。解释器、依赖和两个方向的模型会装入应用私有目录，系统 Python 不受修改；安装下载需要联网。`READER_TRANSLATION_RUNTIME` 可指定另一运行目录。安装器会检查已有资源，损坏时可加 `-Repair`，在新资源验证后将旧目录保留为备份。当前安装脚本仅验收 Windows x64，其他平台没有部署验收。

## Office 页面

Markdown 和 PDF 可直接读取。DOC/DOCX/PPT/PPTX 原版页面预览需要本机 LibreOffice；应用自动发现 PATH 或 Windows 标准安装路径。也可设置 `READER_LIBREOFFICE` 指向 `soffice` 可执行文件。原文件保留；转换可能受本机字体影响。

Windows 安装 LibreOffice 后，默认发现 `C:\Program Files\LibreOffice\program\soffice.com`。中文文档需要相应中文字体。安装后运行 `reader-workbench doctor` 检查可用性，检查本身不会下载语音模型。

转换使用自动清理的系统临时目录作为私有 staging 与 LibreOffice profile，避免深工作区路径导致其内部配置失败；持久预览和文档缓存仍在原工作区中，生成文件仍在 `outputs/<session>/`。

```sh
reader-workbench doctor
reader-workbench web --port 4317
reader-workbench mcp --config-dir /path/to/private/config
```

CLI MCP 桥接连接已运行的 Reader 服务，并使用同一工作区和会话。见 [HTTP API](api.md)、[MCP Server](mcp.md)、[插件/Python 工具](plugins.md)与[验收说明](verification.md)。
