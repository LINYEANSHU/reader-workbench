# 第三方组件说明

- SenseVoiceSmall 模型由 FunAudioLLM/FunASR 提供，ONNX INT8 转换由 csukuangfj/sherpa-onnx 提供。应用保持模型名称、作者和原始来源，按固定版本自动下载：[固定 ONNX 版本](https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/tree/2365baeacb507f821a0c8120fcee3d484dba7a07)、[FunASR 模型协议](https://github.com/modelscope/FunASR/blob/main/MODEL_LICENSE)。模型权重的协议独立于 SenseVoice 项目代码的 MIT 许可。
- sherpa-onnx-node 1.13.8 及对应平台包来自 k2-fsa，使用 [Apache-2.0 许可](https://github.com/k2-fsa/sherpa-onnx/blob/master/LICENSE)。npm 安装的包保留其许可文本。
- PDF.js、React、Fastify、MCP SDK、docx、PptxGenJS、pdf-lib、MathJax 等依赖随 npm 保留各自许可。PDF.js 字体、字符映射及 Web worker 来自锁定的 pdfjs-dist 版本。
- LibreOffice 是用户本机安装的转换程序，开发验收使用的私有解包运行目录不并入 npm 发行包。
- 测试文字、图表、图片和语音句子由本项目生成，不含用户文档；来源与哈希见测试样例清单。
