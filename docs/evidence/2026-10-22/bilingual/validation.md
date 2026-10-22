# Bilingual interface and workspace-memory validation — 2026-10-22

This records local Windows verification of the current source. Published release packages remain at 0.4.0; this change does not create a release tag. The initial working-tree snapshot is commit `71b8aa9`.

| Check | Actual result |
| --- | --- |
| TypeScript | Server/core and browser checks passed. |
| Production build | Passed. The existing Vite large-chunk warning remains visible. |
| Full core suite | 58 files and 333 tests passed; no skipped tests. Actual installed Cognee, local Chinese/English translation and native speech resources were explicitly enabled. |
| Full browser suite | 84 tests passed without skips after the initial-directory race fix, including actual speech, offline translation, native capture and Cognee source navigation. |
| Final affected browser regression | 18 tests passed on the final diagnostic-state implementation, including the additional HTTP503 English→Chinese→English cross-tab test, source-node preservation and translation API target preservation. |
| Diagnostic and locale units | 77 passed, including original-error retention, unavailable storage, interpolation and unknown-text preservation. Included in the final full core run above. |
| Visual checks | English workbench at 1600/768/390px; welcome at 390px; English settings at 320px; reading/translation dialogs at 1600/900px. Both README editions rendered at 900/360px and their local image references passed audit. |
| Actual npm package | English README, real interface image, Cognee worker and setup instructions included. No local instructions, credentials, logs, runtime or workspace data found. Packaged JS/CSS had zero NUL bytes and matched the checked build byte for byte. |
| Code review | No remaining Critical or Important findings after the diagnostic-state fix. |

## Regressions addressed

- Interface selection persists across reloads and workspaces without resetting drafts. Application labels change; source text, chat bodies, filenames, prompt contents, API identifiers, shortcut values and translation targets remain unchanged.
- Workspace-memory status recovers from failed requests. Query edits, refreshes and disabled memory clear old evidence; aborted searches cannot publish delayed results.
- The workspace picker starts at the current workspace. Its initial directory read settles before path editing is enabled; subsequent navigation still rejects stale responses. This fixes an observed race that could prepend the initial home path to a replacement address.
- Error state retains the original diagnostic and translates at render time. A model-list HTTP503 message follows subsequent language changes, including changes in another tab.

## Verification boundaries

The browser uses synthetic source documents and local protocol models for interaction checks. Actual local engines were exercised separately and in their explicitly enabled browser tests; no new remote LLM quality or large-workspace benchmark is claimed.

A local build artifact was found to contain NUL bytes during follow-up verification. It was rebuilt with the trusted local runtime and checked before rerunning the final 18 tests and generating the inspected package. The invalid run is not counted as passing.

Historical screenshot writes from the regression suite were restored to the initial snapshot. Only the new English interface proof is part of this change. Local verification logs, model assets and private test configuration stay ignored.

This local record does not establish macOS/Linux success. Use the **same pushed commit SHA** in [GitHub Actions](https://github.com/LINYEANSHU/reader-workbench/actions/workflows/ci.yml) to verify all Windows, macOS and Linux jobs, including their build, core and browser steps.
