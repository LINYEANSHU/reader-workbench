# Reader Workbench

启动入口、实际验收范围及收尾状态见 [当前版本说明](docs/current-delivery.md)。

项目 Git 仓库位于当前目录，正式代码使用 `main` 分支；首个版本为 `v0.1.0`。后续修改通过 `codex/<功能名>` 分支、小步提交、检查后合并及版本标签迭代。见 [变更日志](CHANGELOG.md)和 [版本迭代说明](docs/versioning.md)。

先选工作区，再在可排列的三栏中阅读文档、进行主对话和临时追问。临时对话每次读取最新完成的主记忆，保留自己的追问链，答案不回写主对话。

首次从源码安装：

```sh
npm ci
npm run build
npm start
```

已安装发行包后，日常只需 `reader-workbench web`。浏览器打开本机地址，选择工作区，在设置中填入 LLM API；原文件保留，生成文件默认存放于工作区的 `outputs/<session>/`。

支持 Markdown、PDF、Word、PPT 及生成文件。Word/PPT 页面预览使用本机 LibreOffice。三栏可拖动、上下或左右排列，每栏独立缩放 50–200%。选中文字右键“询问 AI”进入临时对话；截图快捷键默认 Mod+Shift+X，可在设置中修改。网页截图与浏览器允许选择的屏幕范围分开；系统全局快捷键需要可选原生插件。

两个输入框分别选择模型和思考深度，均内置离线语音输入：首次自动准备 SenseVoice 模型，停止后转写为可编辑草稿，确认发送才调用 LLM。

独立插件 SDK 有 17 类能力接口，附术语助手与 Python 工具示例。HTTP API、MCP HTTP Server 和 `reader-workbench mcp` stdio 桥接复用同一服务状态；也可连接外部 MCP 工具。

- [安装、Office 与语音](docs/installation.md)
- [插件 SDK、Python 与外部 MCP](docs/plugins.md)
- [验收方式及平台实测范围](docs/verification.md)

本轮实际验收为 Windows x64；macOS/Linux 真实运行结果及人工设备操作详见证据记录。
