# Reading plans and document memory — current acceptance

Date: 2026-10-18. This report covers the resumed Task 2 acceptance fixes in `G:/My_project/try`. Existing implementation and unrelated working changes were preserved. No commit or push was performed.

## Corrected behavior

- `DocumentMemoryConsumer.prepare()` authorizes the run, then bypasses model-memory preparation for the actual `demo` provider. Demo answers retain their disclosure and ordinary source excerpts; they create no model-memory references or completed page memories. The copied-workspace document regression now completes normally.
- Overview generation sends only the current selected pages. Cached page memories accumulate and remain reusable when ranges change. New optional `overviewPages` metadata identifies an overview's exact source range; existing schema-version-1 memories without it are interpreted as covering their completed pages. A changed range regenerates its overview without resending cached page images. The same range reuses its scoped overview.
- The status route suppresses a previous range's overview until the current range's overview is available. `rangeComplete` follows the selected range. Cached `completedPages` remains visible as cache state, while the answering context and memory-tool authorization contain only the current run's selected pages.
- `search_document_memory` returns entries and `completedPages` restricted to the run's pinned memory reference. `read_document_memory` and `revisit_document_page` reject cached pages outside that reference. Re-expanding the range reuses the same cache key/generation and sends no cached images again.
- The reading-plan integration helper now narrows the `RunRecord | DocumentJobRecord` union using `kind === 'agent'` before accessing agent-only context.
- Existing exact block-source validation remains active: a sourced formula must match an existing block, page membership and exact text slice of the pinned document version. Missing blocks, wrong offsets and out-of-bounds ranges remain rejected.

## Red/green evidence

The first targeted run reproduced five failures: copied-workspace demo completion, new demo disclosure/excerpt acceptance, narrowed-route stale overview, disjoint-range overview request leakage, and legacy/broader overview reuse. The disjoint test was rerun with an assertion before JSON parsing and failed specifically because its overview request included `"page":1` after selecting only page 2. A separate overview contract regression rejected the initially unsupported `overviewPages` field. After the overview/demo fixes, the narrowed integration test exposed the search tool returning `[2,4]` instead of `[2]`; that metadata leak was then corrected. The resulting targeted run passed all 6 selected acceptance cases.

First complete scoped verification, before the citation/source-scope follow-up below:

```powershell
$env:READER_LIBREOFFICE='G:/My_project/try/.worktrees/reader-workbench/.reader-runtime/LibreOffice/program/soffice.com'
npm test -- tests/unit/reading-plan-contract.test.ts tests/unit/reading-plan-memory.test.ts tests/unit/sourced-memory-search.test.ts tests/unit/document-memory-contract.test.ts tests/unit/visual-document-memory.test.ts tests/integration/reading-plans.test.ts tests/integration/document-memory-store.test.ts tests/integration/document-memory-api.test.ts tests/integration/document-memory-runs.test.ts tests/integration/documents.test.ts tests/unit/context-budget.test.ts
npm run typecheck
```

| Verification | Actual result |
| --- | --- |
| Scoped unit/integration run | 11 files, 59 tests passed; exit 0; 101.18 seconds |
| Reading-plan integration | 7 passed, including real DOCX with PDF preview, text-only model, zero page renders/images |
| Existing document integration | 11 passed, including copied-workspace demo and actual DOCX/PPTX/DOC/PPT conversion |
| Existing memory-run integration | 7 passed; genuine non-visual-provider failure remains covered using a dedicated provider rather than demo |
| Exact block-source store regression | Passed within 5 store tests |
| Core and web TypeScript | `npm run typecheck` exit 0 |
| Scoped tracked diff whitespace | `git diff --check` exit 0 |

PDF.js emitted existing fixture diagnostics (`TT: undefined function: 21` and `Indexing all PDF objects`) during document integration; there were no failing tests. Git warned that the reading plugin's LF endings may be normalized to CRLF on a future Git operation; no whitespace errors were reported.

## Continuation file scope

Production changes in this continuation: `packages/contracts/src/document-memory.ts`, `packages/core/src/documents/memory-consumer.ts`, `packages/core/src/tools/document-memory.ts`, `packages/core/src/sessions/context.ts`, `apps/server/src/routes/document-memory.ts`, and `plugins/visual-document-memory/reading.mjs`.

Regression changes: `tests/integration/reading-plans.test.ts`, `tests/integration/document-memory-runs.test.ts`, `tests/unit/reading-plan-memory.test.ts`, and `tests/unit/document-memory-contract.test.ts`. Other Task 2 implementation files were retained and exercised without reimplementation.

## Citation and pinned source-scope follow-up

The current context now starts `sourceRanges` empty and collects only sources actually supplied for this turn. It no longer copies all committed main/temporary history anchors into the next result or its citation events. Historical messages, committed turns and their original source anchors remain intact. A new complete-run regression first commits a Markdown selection, reads PDF pages `[2,4]`, then narrows to `[2]`: the current context, persisted citation events and new turn contain only PDF page 2. Its temporary follow-up still receives the prior Markdown marker through normal inherited history; the parent session snapshot is unchanged.

`ContextBuilder` also publishes `documentReadScopes` pinned to the run. Selection-only runs publish `[]`. Other runs use the prepared memory reference's pages, or the saved reading plan when no model memory is used; a builder without an attached consumer uses its parsed pages after waiting for parsing to finish. Fallback source search, excerpts and the first automatic page image obey those same pages. Search passes the page scope into `DocumentService.search()` before ranking/limiting, using the root integrator's new optional page parameter.

Red/green: the new citation regression reproduced the old Markdown page 1 and PDF page 4 anchors in a run narrowed to PDF page 2. Selection, demo and disabled-memory scope assertions also failed before implementation. All four targeted cases passed after the change. The existing repeated-source-citation main/temporary regression then passed after preserving the parsing wait in the no-consumer path.

An intermediate joint snapshot, taken while the root integrator's source-tool changes were still being written, recorded five failures: `refuses a known document version absent from this run before source access`, `selection-only asks cannot expand into ordinary page, block, or search reads`, `enforces a pinned reading range even when document memory is disabled`, `searches selected pages beyond the first hundred global matches`, and `keeps repeated source citations unique across completed main and temporary turns`. Its typecheck also observed three temporary `record.context` narrowing errors in `builtins.ts`. All those failures were corrected and passed in the fresh final joint run below.

```powershell
$env:READER_LIBREOFFICE='G:/My_project/try/.worktrees/reader-workbench/.reader-runtime/LibreOffice/program/soffice.com'
npm test -- tests/integration/reading-plans.test.ts tests/integration/reading-source-scope.test.ts tests/integration/document-memory-runs.test.ts tests/integration/runs.test.ts tests/unit/context-budget.test.ts
npm run typecheck
```

Final follow-up verification: 5 files and 39 tests passed, exit 0, 42.93 seconds. This includes all 10 reading-plan cases, 6 ordinary source-tool scope cases, 7 document-memory run cases, 13 run/history cases and 3 context-budget cases. Core/web typecheck passed with exit 0. The narrowed-memory scope assertion was then run once more after adding an explicit `documentReadScopes === [{document, pages:[2]}]` check and passed. The scoped `context.ts` whitespace check passed. Only `context.ts`, `reading-plans.test.ts` and this report were changed for the follow-up.

## Verification boundaries

The root integrator owns ordinary source-tool scope enforcement (`builtins.ts` and its integration regression), UI source navigation, full-suite/build/browser acceptance, and independent review closure. This scoped report does not replace those checks. Synthetic model requests verify protocol, page coverage and source boundaries; no live-model reading quality, remote CI, or macOS/Linux runtime result is claimed.
