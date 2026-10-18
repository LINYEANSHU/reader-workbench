# Implementation progress — 2026-10-18

Plan: docs/superpowers/plans/2026-10-18-reading-controls-translation.md
Spec: docs/superpowers/specs/2026-10-18-reading-controls-translation-design.md

User authorization: develop all requested changes including translation directly; no learning linkage and no pending Skill.

Ruling: work in place on codex/reading-controls-translation to retain the 94 pre-existing uncommitted files; do not commit or push. Creating a worktree from HEAD would omit the current UI/model settings work needed by this implementation.

Preflight boundaries:

| Tasks | Shared boundary | Decision |
| --- | --- | --- |
| 1 / 4 | SelectControl, browser API | Task 1 defines API; root integrates temporary branches without parallel edits to Workbench |
| 2 / 4 | reading-plan routes, app.onParsed, DocumentMemoryPanel | Fixed contract in plan; root owns app.ts and first-open dialog |
| 3 / 4 | processing service, plugin bundle, UI | Task 3 reports API early; root owns app/bundle and UI |
| 2 / 3 | document source/model registry | Read existing DocumentService; new contracts separate; no shared files except read-only SDK definitions |
| 1 / 2 / 3 | api/client | Agents use separate API helpers or api.request; root owns shared client |

## Implementation status

Tasks 1–4 are complete. The requested features, root integration, regression fixes and bounded independent code/visual acceptance are complete locally. No dependency or application-version change was needed.

| Area | Delivered behavior | Detailed evidence |
| --- | --- | --- |
| Workspace and selectors | Canonical Explorer-style directory tree, roots/recents, address/breadcrumbs, history and filtering; shared rounded searchable/keyboard menus for appearance, models and temporary branches | [Controls report](2026-10-18-controls-report.md) |
| Reading and memory | Version-scoped first-N/multiple-range reading, incremental page-cache reuse, text pre-read for Markdown/Word, visual pre-read for PDF/PPT, formula/figure/term search and honest source granularity | [Memory report](2026-10-18-memory-report.md) |
| Translation | Bundled processor plugin, actual text-layer/selection extraction, progress/cancel, preview/download, explicit collision-safe save; portable Markdown, editable DOCX, source/translation comparison PDF | [Translation report](2026-10-18-translation-report.md) |
| Integration | First-open range dialog, selection translation menu, memory source navigation, enabled translation action, authenticated routes and lifecycle cleanup | [Independent review](2026-10-18-independent-review.md) |

The five independently reported defects were fixed and re-reviewed: overview range leakage, ordinary source-tool scope, protected Markdown code-image examples, text-document page navigation and final-authorization cancellation. Current document/page permissions are pinned per run; changing a plan limits fresh source reads while preserving earlier conversation/history. Page-only Markdown/text locations go to the document start without fabricating an exact formula highlight.

## Verification recorded so far

- Fresh root/web typecheck and production build passed. Vite still reports the existing large JavaScript chunk warning.
- Full Vitest pass at 16:39–16:45 covered 49 files: 212 passed, one old alternative-model fixture failed because it did not implement the newly enabled Markdown memory protocol, and two optional native-speech tests were skipped without their configured assets. The fixture was corrected without weakening its actual context-transform assertion. Its five tests and source-scope/policy tests then passed **14/14**. The later Markdown-table fix passed **17/17** plugin tests (two new cases), and does not change Office handling. These are a full discovery run plus scoped fixes, not a claim that the earlier full command exited zero.
- Real LibreOffice 26.2.6.3 conversion, editable translated DOCX reopen, Chinese PDF output and original byte preservation passed; no live production-model translation-quality claim is made.
- One Impeccable detector run across 16 changed UI/style targets returned `[]`. Batched screenshots cover all three themes, desktop/narrow menus, Explorer, first-read ranges and translation. One final confirmation round follows the CSS-specificity/fieldset fixes; no open-ended polishing loop.
- Final root/web typecheck and production build passed against the completed sources. `node --check plugins/document-translation/translation.mjs` and repository `git diff --check` passed.
- Final complete browser discovery ran **66 tests**: **62 passed**, three optional native-speech tests skipped without their configured model assets, and one older four-format selection test failed while Word was still converting at its 15-second assertion. The document-version assertion was preserved, the conversion wait increased to 60 seconds and this format-specific test budget to 180 seconds; the complete selection file then passed **4/4 in 50.5 s**, including real Word/PPT selections. Thus all **63 non-optional browser cases** were verified through the full run plus the scoped fix, not a claim that the earlier full command exited zero.
- The new PDF-selection translation browser case passed on an actual PDF text layer, asserting that all model calls use the translation block protocol and contain no page images or document-memory requests. Multiple first-read ranges, invalid-range handling, Markdown translation preview/save and page-level memory navigation also passed.
- Fresh final affected-module verification passed **37/37 across six files**: translation (17), processing (5), authenticated processing API (1), plugin consumers (5), source scope (6) and scope policy (3). Combined with the complete discovery run above, all **215 non-optional unit/integration cases** in the final source were verified; two optional native-speech cases remain explicitly skipped.
- The 18 final screenshots passed [independent visual acceptance](2026-10-18-visual-review.md). Desktop Explorer width, the translation fieldset and Markdown table preview were confirmed after the single fix batch. Narrow workbench screenshots deliberately use rows with the sidebar closed; translation screenshots cover desktop ink only. Original `docs/evidence` images were restored from the pre-test backup and all **123 SHA-256 hashes** matched; the 18 new confirmation images remain available.
- `npm pack --dry-run --json` verified a 302-file package manifest containing all three translation-plugin files, SDK exports and the built Web client, with `Agents.md`, credentials and private runtime/workspace data excluded. No package was released or pushed.

## Boundaries

PDF/PPT translation outputs original pages with labelled translated companion pages rather than replacing text in the original layout. Textless scans do not trigger OCR. Word page subsets cannot be mapped reliably back to editable DOCX XML, so this version accepts full-document or selected-text translation; continuous translated text uses the first native text node and its style, so style spans/pagination may change. Previews/tasks are ephemeral across server restart. Learning linkage is excluded.

This is local development on `codex/reading-controls-translation`, based on `c6e5736`; there is no new commit, push, release or remote CI claim. Existing staged/unstaged/untracked work and private configuration are retained. The staging area remains unchanged and local `Agents.md` remains ignored. Windows runtime/browser checks do not substitute for macOS/Linux or a future push's exact-SHA Actions acceptance.
