<div align="center">

# Reader Workbench · 阅读工作台

**把原文、思考与追问放在同一张桌面上。**

面向个人学习与科研的 Windows 文档阅读工具。<br>
读论文、看课件、核对公式与来源，再把理解整理成自己的阅读件。

**简体中文 · [English →](README.en.md)**

[![Windows CI](https://github.com/LINYEANSHU/reader-workbench/actions/workflows/ci.yml/badge.svg?branch=codex%2Fworkspace-memory-cognee)](https://github.com/LINYEANSHU/reader-workbench/actions/workflows/ci.yml?query=branch%3Acodex%2Fworkspace-memory-cognee)
[![Windows](https://img.shields.io/badge/Windows-x64-2563eb)](#快速开始)
[![Node.js](https://img.shields.io/badge/Node.js-24%2B-417e38)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-Apache_2.0-64748b)](LICENSE)

[快速开始](#快速开始) · [阅读方式](#阅读方式) · [翻译与记忆](#翻译与记忆) · [数据与隐私](#数据与隐私) · [文档](#文档)

</div>

![真实应用中的三栏阅读：原文、主对话与独立追问并排显示](docs/ui-polish/2026-10-14/evidence/final-ink-pdf.png)

<div align="center"><sub>真实应用 · 合成示例文档 · 墨蓝外观。截图展示阅读流程，不代表模型回答质量；当前界面细节可能有所更新。</sub></div>

## 阅读方式

| 阅读原文 | 持续思考 | 随手追问 |
| --- | --- | --- |
| 打开 PDF、Markdown、Word、PowerPoint 和图片，核对页码、公式与图表。 | 在主对话中梳理概念，复用已有页记忆，生成阅读笔记。 | 选中文字或截图提问，继承已完成的主记忆，保留独立历史。 |

- **先读需要的页。** 首次打开 PDF/Office 时选择全部、前几页或 `2-3,10-15`，后续补读缺失页面。
- **沿着来源回原文。** 搜索术语、公式和图表，点击引用回看；扫描件与无文字层图片不自动 OCR。
- **整理时保留原文件。** 预览译文后显式另存，生成结果默认写入 `outputs/<session>/`。
- **按自己的习惯阅读。** 中英文界面、浅色/石墨/墨蓝外观、可拖动三栏与独立缩放、离线语音输入。

> **维护范围：Windows。** 当前版本只提供 Windows 构建、测试、安全审计和后续更新，主要验证环境为 Windows x64。macOS 与 Linux 停止维护和发布。

## 快速开始

准备 **Windows、Node.js 24+、Git**，在 PowerShell 中运行：

```powershell
git clone --branch codex/workspace-memory-cognee https://github.com/LINYEANSHU/reader-workbench.git
cd reader-workbench
npm ci
npm run build
npm start
```

浏览器默认打开 `http://127.0.0.1:4317`。以后可直接双击 **`Start-Reader.cmd`** 启动；保持启动窗口打开，按 `Ctrl+C` 停止服务。

**第一次使用只需三步：**

1. **选资料目录。** 打开本地工作区，从文件树选择一份文档。
2. **连接模型。** 在「设置 → 模型连接」填写 Base URL、模型名和 API Key。PDF/PPT 图像预读需要视觉模型；Markdown/Word 文本阅读可用文字模型。
3. **开始提问。** 例如：「解释本节的核心概念和公式适用条件，并标出可以核对的页码。」局部疑问可选中文字后点「询问 AI」，或使用 `Ctrl+Shift+X` 截图。

Office 原版页面预览需要另行安装 **LibreOffice**。安装后运行 `node bin/reader-workbench.mjs doctor` 检查依赖；PDF、Markdown 和图片可独立使用。详细步骤见[安装与运行](docs/installation.md)。

<details>
<summary><strong>已有 v0.4.0 发行包？</strong></summary>

已发布的 [v0.4.0](https://github.com/LINYEANSHU/reader-workbench/releases/tag/v0.4.0) 是历史版本，不包含后续的双语界面、工作区记忆及本次修复。要使用当前功能，请按上面的源码步骤安装。应用包版本仍为 `0.4.0`，SDK 协议为 `1.2.0`；本次不创建新发布标签。

安装已有包可执行 `npm install --global .\reader-workbench-0.4.0.tgz`，随后运行 `reader-workbench web`。

</details>

## 中英文切换

欢迎页和工作台右上角的 **界面语言 / Interface language** 可切换 **简体中文 / English**。浏览器保存选择，切换时保留对话和输入草稿。原文、文件名及聊天内容保持原样；AI 的回答语言由提问与模型提示词决定。

本文档的[英文版本](README.en.md)与中文版本在顶部互相链接。

## 翻译与记忆

### 文档翻译

点击「一键翻译」，选择语言、范围和本地离线引擎或已配置的 AI 模型，预览后再点「另存译文」。选区的解释或翻译通过「询问 AI」进入临时对话。

| 原文 | 另存结果 |
| --- | --- |
| Markdown | 保留代码、公式、链接和本地图片的新 Markdown。 |
| Word | 全文翻译为可编辑 DOCX；不支持按预览页切割原 DOCX，分页和样式可能变化。 |
| PDF / PowerPoint | 原页与译文伴读页配对的 PDF；图内文字和公式保留在原页。 |

离线中英翻译运行库需单独准备，约 309 MiB，不随源码或 npm 包发布。在 Windows x64 上使用 Python 3.12：

```powershell
.\scripts\setup-local-translation.ps1 -Python "C:\path\to\Python312\python.exe"
```

安装下载需要联网，推理在本地运行。译文预览任务不会跨服务重启保留，请先下载或另存。见[安装与修复](docs/installation.md#本地中英翻译)。

### 工作区关联记忆 · 试验

关联同一工作区及子目录中的可读资料，为普通问题检索少量相关原文。逐页文档记忆保持独立，选区问题保持局部范围。

```powershell
node scripts/setup-workspace-memory.mjs
```

需要 Python 3.10–3.14，推荐 3.11。准备后重启，在侧栏「工作区记忆」查看进度、检索出处或更新资料。索引留在 `.reader-workbench/knowledge/`；默认排除隐藏目录、输出、凭据类文件和符号链接，并尊重 `.gitignore` 与 `.readerignore`。

这是实验功能：单次最多 5,000 份资料、每份最多 64 MiB，不自动 OCR，不将小样验证视为复杂中文关系或数学推理质量保证。完整边界见[工作区记忆](docs/workspace-memory.md)。

## 数据与隐私

原文件留在原目录；缓存、页记忆和聊天历史位于工作区的 `.reader-workbench/`。模型连接、密钥、提示词和选择保存在本机用户配置目录，跨工作区共用。

**使用远程模型时，回答所需的文本、记忆与页面图像会发送给你配置的服务。** 离线语音识别先产生可编辑草稿，发送后才调用 LLM。

仓库忽略本地指令、私有配置、密钥、数据库、模型运行库、日志、审查证据、测试结果与生成包。自行放入仓库的私人资料请使用被忽略的 `private/`、`local-data/` 等目录，或补充自己的忽略规则。`.gitignore` 不会自动撤回已经跟踪的文件。

目录插件和外部 MCP 的执行授权绑定本机、工作区及代码摘要；更新后可能需要在设置中重新信任。详见[插件与权限](docs/plugins.md)。

## 开发与验证

Windows CI 对同一提交执行依赖安全审计、样例完整性检查、类型检查、构建、原生截图重复测试、单元/集成测试及浏览器端测试。查看[当前分支的实际运行结果](https://github.com/LINYEANSHU/reader-workbench/actions/workflows/ci.yml?query=branch%3Acodex%2Fworkspace-memory-cognee)。

```powershell
npm audit --audit-level=low --registry=https://registry.npmjs.org
npm run typecheck
npm run build
npm test
npm run test:e2e
```

完整测试需要 LibreOffice、中文字体、Playwright 浏览器和语音资源；配置方法与历史验收边界见[验证说明](docs/verification.md)。更新源码前停止服务并保存改动，再运行 `git pull --ff-only`、`npm ci` 和 `npm run build`；保留原工作区及私有配置。

## 文档

[安装与运行](docs/installation.md) · [更新记录](CHANGELOG.md) · [工作区记忆](docs/workspace-memory.md) · [插件 / Python / 外部 MCP](docs/plugins.md) · [HTTP API](docs/api.md) · [MCP 服务](docs/mcp.md) · [第三方组件](docs/THIRD_PARTY.md)

## 许可证

本项目源码以 **[Apache License 2.0](LICENSE)** 开源。第三方依赖、语音和翻译模型保留各自的许可证及使用条款，见[第三方组件说明](docs/THIRD_PARTY.md)。
