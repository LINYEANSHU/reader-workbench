# Reading Controls and Translation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for each isolated module. Use superpowers:dispatching-parallel-agents only across the three non-overlapping file groups below. Integrate and independently review the complete result before finishing. Steps use checkbox syntax.

**Goal:** Deliver the approved directory/selection improvements, scoped first reading, searchable sourced memory and plugin-based translation without learning linkage.

**Architecture:** Three independently owned modules; root owns shared entry-point integration. Existing dirty work is preserved; no commits/pushes. Direct implementation is explicitly authorized by the user.

**Tech Stack:** React/TypeScript, Fastify, local SQLite, PDF.js, pdf-lib, LibreOffice, existing ZIP/XML libraries.

**Spec:** docs/superpowers/specs/2026-10-18-reading-controls-translation-design.md

## Global Constraints

- Learning linkage is excluded. No external Skill is pending.
- Preserve all existing staged/unstaged/untracked work and original documents; never expose credentials.
- Keep three existing themes and reasoning-effort behavior; all dropdown overlays match the workbench.
- Validate document version, workspace, actor and session; cancelled/failed work cannot publish artifacts.
- Keep translation in plugins/document-translation; generic host APIs only in core/SDK.
- No default OCR, no model-invented geometry, no output-token caps, no silent truncation.

## Review Focus

- Drive/UNC root navigation and out-of-order directory requests must not select an unintended path.
- Reading 8 of 200 pages is complete for that range and never sends the remaining pages automatically.
- Word with PDF preview must stay on the text input path; selection-only operations must not pre-read the file.
- Formula search must distinguish versions and preserve page-level uncertainty rather than fabricate exact boxes.
- Translation model failures, missing IDs, cancellation, foreign sessions and oversized translations must not produce falsely complete results or overwrite originals.

### Task 1: Explorer and shared selection controls

**Files:** WorkspacePicker, directory-browser, workspaces contracts/routes/service, new components/SelectControl.tsx and styles; AppearanceSwitch, Composer, AgentPreferences, SettingsDialog; scoped tests. Do not edit Workbench, api/client, DocumentPane, app.ts, package.json or memory/translation files.

**Interfaces:** Keep legacy GET /directories returning DirectoryEntry[]. Add GET /directories/browser returning {path,parent,entries,roots}; frontend may use api.request directly. Produce SelectControl exported with value/options/onChange/aria-label and disabled/searchable/className props; report exact API. Root replaces temporary branch control.

- [x] Add meaningful failing navigation/API and browser control tests, observe expected failures.
- [x] Implement bounded lazy directory navigation/history and theme-consistent accessible popover controls.
- [x] Run relevant tests and typecheck of owned files; report any shared integration needs. Do not commit.

### Task 2: Reading plans and sourced memory retrieval

**Files:** new contracts/reading-plan.ts, contracts/document-memory.ts, sdk/document-memory.ts, memory-consumer/store, document-memory routes/tools, sessions/context, visual-document-memory plugin, storage/workspace-store retrieval, DocumentMemoryPanel and its CSS/tests. Do not edit app.ts, api/client, DocumentPane, Workbench, package.json, bundled.ts, directory or translation modules.

**Interfaces:** GET/PUT /api/v1/workspaces/:id/documents/:documentId/:version/reading-plan returns {pages:number[],pageCount:number,mode:'visual'|'text',configured:boolean}; PUT accepts {pages:number[]|null}. Shared parsePageRanges(input,total):number[]. Missing plan defaults all with configured:false. Add memory/search?providerId=&query=&kind= returning sourced entries. DocumentMemoryPanel accepts optional onOpen:(anchor)=>void. API helper can use api.request directly without changing api/client. Root removes onParsed auto full rendering and adds first-open plan UI.

- [x] Add range/contract/retrieval and request-capture tests; confirm current code fails intended assertions.
- [x] Persist range by document version; read missing selected pages only; text path for Markdown/Word, vision path for PDF/PPT. Preserve v1 compatibility and show selected-range completion distinctly.
- [x] Add structured sourced formula/figure/term entries and Chinese/number-aware ranking; searching unknown pages never claims their model memory exists.
- [x] Update panel for range status, search, item source navigation and supplement reading.
- [x] Run relevant tests and report red/green evidence; do not commit.

### Task 3: Plugin document processing and translation

**Files:** new contracts/document-processing.ts, sdk/document-processing.ts, core/documents/processing*.ts, server/routes/document-processing.ts, plugins/document-translation/** and scoped tests. May add documentProcessor field to sdk/capabilities.ts and SDK exports, plugin manager support as needed. Do not edit app.ts, bundled.ts, api/client, DocumentPane, Workbench, package.json or memory/directory files.

**Interfaces:** Implement DocumentProcessingService with dependencies object {workspaces,documents,repository,capabilities,artifacts}; route function documentProcessingRoutes(app,service,auth). Task contract includes identity/status/progress/errors/warnings/preview metadata. Start request identifies document/provider/session/processorId/targetLanguage/pages and optional selection; poll/cancel/preview/save are actor/session scoped. Plugin registers documentProcessor capability named document-translation.translate. Root wires construction/routes/close and installs bundle. Service never returns host filesystem paths. Publish via authorized ArtifactService scope only on explicit save. Report exact signatures promptly for root UI integration.

- [x] Write failing tests for block identity validation, original protection, Markdown syntax/resources, editable DOCX XML, PDF text geometry and task scope/cancel/save.
- [x] Implement generic host processing service with cancellable model lease, scoped cache preview and explicit artifact save.
- [x] Implement actual plugin translation orchestration/format handling; preserve formulas and non-body content; validate every block ID and bound input; no fake completed output.
- [x] Reuse existing dependencies; tell root before package changes if one essential dependency is needed. Run scoped tests and document limitations; do not commit.

### Task 4: Root integration and full acceptance

**Files:** app.ts, bundled.ts, api/client if necessary, DocumentPane, Workbench, new ReadingPlanDialog/TranslationDialog and API helpers, CSS, docs, integration/E2E tests; package only if required.

- [x] Capture baseline suite, record environmental failures, correct environment where possible.
- [x] Integrate first-open range configuration without repeated prompts, supply memory-source navigation and generic translation preview/save controls.
- [x] Update existing native-select E2E helpers to real combobox clicks/keys; preserve persistence and regression assertions.
- [x] Run full suite, typecheck/build, meaningful browser E2E and rendered output checks. Inspect three themes and responsive overlays in one batch, fix in one batch and confirm once.
- [x] Run impeccable mechanical detector once on changed UI. Obtain independent full-code and visual review, address material findings with regression tests.
- [x] Report actual implemented scope, test counts and remaining limitations without claiming remote CI or real-model quality not verified.
