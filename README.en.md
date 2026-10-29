<div align="center">

# Reader Workbench

**Keep the source, your thinking and your questions side by side.**

A Windows document reading tool for personal study and research.<br>
Read papers and course materials, check formulas and sources, and turn understanding into reading notes.

**[← 简体中文](README.md) · English**

[![Windows CI](https://github.com/LINYEANSHU/reader-workbench/actions/workflows/ci.yml/badge.svg?branch=codex%2Fworkspace-memory-cognee)](https://github.com/LINYEANSHU/reader-workbench/actions/workflows/ci.yml?query=branch%3Acodex%2Fworkspace-memory-cognee)
[![Windows](https://img.shields.io/badge/Windows-x64-2563eb)](#quick-start)
[![Node.js](https://img.shields.io/badge/Node.js-24%2B-417e38)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-Apache_2.0-64748b)](LICENSE)

[Quick start](#quick-start) · [Reading workflow](#reading-workflow) · [Translation and memory](#translation-and-memory) · [Data and privacy](#data-and-privacy) · [Documentation](#documentation)

</div>

![Actual English interface showing the source document, main chat and independent follow-up chat](docs/evidence/2026-10-22/bilingual/english-workbench.png)

<div align="center"><sub>Real application · synthetic sample document · English interface. This demonstrates the reading workflow, not model answer quality; current interface details may differ.</sub></div>

## Reading workflow

| Read the source | Develop your thinking | Ask a quick follow-up |
| --- | --- | --- |
| Open PDF, Markdown, Word, PowerPoint and images; check pages, formulas and figures. | Build an analysis in main chat, reuse page memory and create reading notes. | Select text or capture a region, inherit completed main memory and keep a separate history. |

- **Start with the pages you need.** Choose all pages, the first few or ranges such as `2-3,10-15` when opening PDF/Office files; read missing pages later.
- **Follow evidence back to the source.** Search terms, formulas and figures and click citations. Scans and images without a text layer are not automatically OCRed.
- **Preserve the originals.** Preview a translation and explicitly save a new file. Generated files default to `outputs/<session>/`.
- **Make room for your reading style.** Chinese/English controls, Light/Graphite/Ink themes, resizable panes with independent zoom, and offline speech input.

> **Maintained platform: Windows.** Current builds, tests, security audits and future updates cover Windows, primarily validated on Windows x64. macOS and Linux maintenance and releases have ended.

## Quick start

Install **Windows, Node.js 24+ and Git**, then run in PowerShell:

```powershell
git clone --branch codex/workspace-memory-cognee https://github.com/LINYEANSHU/reader-workbench.git
cd reader-workbench
npm ci
npm run build
npm start
```

The browser opens `http://127.0.0.1:4317` by default. After building, double-click **`Start-Reader.cmd`** for subsequent launches. Keep its window open; press `Ctrl+C` to stop the service.

**Your first reading session takes three steps:**

1. **Choose a folder.** Open a local workspace and select a document in the file tree.
2. **Connect a model.** In Settings → Model connections, enter your Base URL, model name and API key. PDF/PPT image pre-reading needs vision; Markdown/Word text reading can use a text model.
3. **Ask a question.** Try: “Explain this section's core concepts and the conditions under which its formulas apply. Include pages I can check.” For a focused question, select text and choose Ask AI, or capture a region with `Ctrl+Shift+X`.

Original-page Office previews need a separate **LibreOffice** installation. Run `node bin/reader-workbench.mjs doctor` to check dependencies; PDF, Markdown and images work independently. See [installation and troubleshooting](docs/installation.md).

<details>
<summary><strong>Already have the v0.4.0 package?</strong></summary>

The published [v0.4.0 release](https://github.com/LINYEANSHU/reader-workbench/releases/tag/v0.4.0) is historical. It does not include the later bilingual interface, workspace memory or these fixes. Use the source instructions above for current features. The application package version remains `0.4.0`, and the SDK protocol remains `1.2.0`; this update creates no new release tag.

To use an existing package, run `npm install --global .\reader-workbench-0.4.0.tgz`, then `reader-workbench web`.

</details>

## Language switching

Use **界面语言 / Interface language** on the welcome page or upper-right workbench toolbar to choose **简体中文 / English**. Your browser remembers the choice and preserves the chat and draft when switching. Original documents, filenames and chat content keep their language; AI answer language follows your question and model instructions.

The [Chinese edition](README.md) and this English edition link to each other at the top.

## Translation and memory

### Document translation

Choose Translate document, a target language, a range, and the offline engine or your configured AI model. Preview the result, then explicitly save a new translation. Use Ask AI for selected text; the answer goes into follow-up chat.

| Source | Saved result |
| --- | --- |
| Markdown | New Markdown retaining code, formulas, links and local images. |
| Word | Full-document editable DOCX; slicing the original DOCX by preview pages is unsupported, and pagination or styles may change. |
| PDF / PowerPoint | Paired original and translated companion pages in a PDF; formulas and text inside figures remain in the original pages. |

Prepare the separate offline Chinese/English runtime, approximately 309 MiB; it is excluded from source and npm packages. On Windows x64 with Python 3.12:

```powershell
.\scripts\setup-local-translation.ps1 -Python "C:\path\to\Python312\python.exe"
```

Downloads need internet access; inference runs locally. Preview tasks do not survive a service restart, so download or save first. See [installation and repair](docs/installation.md#本地中英翻译).

### Workspace memory · experimental

Associate readable documents across a workspace and its subdirectories to retrieve small amounts of relevant source text for ordinary questions. Page memory remains independent; selection questions remain locally scoped.

```powershell
node scripts/setup-workspace-memory.mjs
```

Requires Python 3.10–3.14; 3.11 is recommended. Restart after setup, then use Workspace memory in the sidebar to inspect progress, search sources or refresh files. Indexes stay under `.reader-workbench/knowledge/`. Discovery excludes hidden directories, outputs, credential-like filenames and symbolic links, and respects `.gitignore` and `.readerignore`.

This is experimental: at most 5,000 files per discovery, each up to 64 MiB, with no automatic OCR. Small-sample checks do not establish complex Chinese relationship or mathematical reasoning quality. See [setup and limitations](docs/workspace-memory.md).

## Data and privacy

Originals stay in their folders. Caches, page memory and chat history live under the workspace's `.reader-workbench/`. Model connections, keys, prompts and selections live in the computer's private user configuration directory and are shared across workspaces.

**Using a remote model sends the text, memory and page images needed for your question to the service you configure.** Offline speech recognition produces an editable draft; the LLM is called only after you send it.

The repository ignores local instructions, private settings, keys, databases, model runtimes, logs, review evidence, test results and generated packages. Keep personal material in ignored folders such as `private/` or `local-data/`, or add your own rules. `.gitignore` does not remove files already tracked by Git.

Execution grants for directory plugins and external MCP commands are bound to the local machine, workspace and code digest. Updates may require trusting them again in Settings. See [plugins and permissions](docs/plugins.md).

## Development and verification

Windows CI runs the dependency security audit, fixture integrity checks, type checking, build, repeated native screen-capture checks, unit/integration tests and browser tests for the same commit. See [actual runs for this branch](https://github.com/LINYEANSHU/reader-workbench/actions/workflows/ci.yml?query=branch%3Acodex%2Fworkspace-memory-cognee).

```powershell
npm audit --audit-level=low --registry=https://registry.npmjs.org
npm run typecheck
npm run build
npm test
npm run test:e2e
```

The full suite requires LibreOffice, Chinese fonts, Playwright browsers and speech assets; see [verification requirements and historical results](docs/verification.md). To update, stop the service, save your changes, then run `git pull --ff-only`, `npm ci` and `npm run build`. Keep the original workspace and private configuration.

## Documentation

[Installation](docs/installation.md) · [Changelog](CHANGELOG.md) · [Workspace memory](docs/workspace-memory.md) · [Plugins / Python / external MCP](docs/plugins.md) · [HTTP API](docs/api.md) · [MCP service](docs/mcp.md) · [Third-party components](docs/THIRD_PARTY.md)

Supporting technical documents currently use Chinese unless otherwise indicated.

## License

Project source is available under the **[Apache License 2.0](LICENSE)**. Third-party dependencies, speech models and translation models retain their own licenses and terms; see [third-party notices](docs/THIRD_PARTY.md).
