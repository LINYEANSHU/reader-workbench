# Workspace memory local trial — 2026-10-19

Baseline: `197b64d9096fbe473a1b88f3af17a4aa14cb41f2`, including the committed v0.4.0 implementation at `f19a7d3`. Trial branch: `codex/workspace-memory-cognee`. No push or release.

| Check | Actual result |
| --- | --- |
| Typecheck | Passed, both server/core and web |
| Build | Passed; existing Vite large-chunk warning |
| Full Vitest suite, Windows | 245 passed, 11 environment-gated tests skipped, 308.86 seconds |
| Focused memory/context/process regressions | 19 passed |
| Actual Cognee 1.6.5 with local GLiNER and multilingual FastEmbed | Passed in 63.89 seconds; two synthetic files recalled from Chinese queries; recovered after deleting the graph cache without changing source files |
| Chromium browser | 2 passed in 34.0 seconds; honest missing-runtime state, persistent switch, actual graph/search, both source files and exact source navigation |
| Visual check | 1600px and 768px screenshots inspected |
| Package dry-run | Required worker, requirements, installer and documentation present; local config, models, runtime, logs and Agents.md absent |
| Existing unrelated files | All 10 original dirty screenshot SHA256 values unchanged |

The normal suite skips the real Cognee test unless explicitly configured; the separate actual-engine run above executed it. Other skipped tests require the existing speech/translation assets. No macOS/Linux run or GitHub Actions validation is claimed for this local trial.

Independent review identified and verified fixes for unhandled worker input-pipe errors, shutdown during asynchronous worker creation, and engine/app snapshot inconsistency. Source tests cover recursive discovery without course naming, nested exclusion rules, duplicate provenance, workspace isolation, changed/deleted sources, narrowed page ranges, unknown engine IDs, interrupted builds and selection-only context isolation.

Windows testing also exposed native Ladybug failures on Chinese absolute paths. The pinned worker now supplies database paths relative to its fixed workspace cache directory; the failing Chinese/space-path probe and real browser subsequently passed. No source or graph data is moved outside its workspace.

This is a small real-engine trial, not a broad benchmark of Chinese relationship extraction, mathematical reasoning or large-workspace quality. GLiNER's upstream integration remains a demo. Image-only material without extractable text is reported as lacking indexed evidence; no automatic OCR or visual understanding is claimed.
