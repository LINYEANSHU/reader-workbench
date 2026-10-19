# Workspace-wide Cognee memory trial

The user authorized implementation on 2026-10-19 after reviewing memory engines, replacing course-specific organization with automatic association of files in the selected workspace. Baseline: `197b64d9096fbe473a1b88f3af17a4aa14cb41f2`; existing dirty evidence screenshots are unrelated and preserved.

## Behavior

Selecting a workspace discovers supported readable documents recursively. No course labels, lecture/tutorial conventions or manual classification are required. Documents retain their paths and source versions. Existing page-reading memory remains authoritative for the pages actually processed; workspace indexing does not claim visual understanding of unread images.

Text is split into bounded source passages and identical normalized passages share one searchable item with all source anchors retained. Cognee 1.6.5 provides local graph extraction and graph/vector retrieval, using an isolated Python runtime with local extraction and embedding models. Installation and model downloads occur only during explicit setup, never as a hidden side effect of answering.

Only the selected workspace is searched. A normal question may receive a small set of relevant passages from other files and their actual source anchors. Selection-only questions retain their existing restricted scope. Explicit reading ranges are not widened by workspace recall. The answer prompt distinguishes retrieved source text from instructions or verified conclusions.

Source snapshots live in the workspace database and graph storage under `.reader-workbench/knowledge`; interpreter configuration is user-scoped under `agent/workspace-memory.json`. An installed runtime enables automatic indexing after selection. Without a configured runtime the trial reports unavailable and existing reading continues unchanged. Disabling it stops background jobs and removes workspace recall from subsequent requests.

## Safety and freshness

Skip hidden/internal/dependency/version-control directories, symbolic links, ignored files, credential-like filenames and unsupported binary formats. Discovery limits and unreadable/image-only documents are visible in status instead of being reported as fully remembered. Respect nested `.gitignore` and optional `.readerignore` rules.

Every recall result must map to a known item, authorized workspace and existing exact document version. Recheck source bytes before injecting evidence; missing or changed files cannot contribute stale citations. Updates publish a new completed snapshot atomically; failed builds retain the prior snapshot for inspection but never bypass freshness checks. No chat or temporary answer is automatically promoted to source knowledge.

## Trial delivery

Provide an isolated runtime installer, authenticated status/settings/rebuild/search API, compact workspace memory panel with progress and source navigation, automatic context integration and an end-to-end local Cognee smoke probe on synthetic files. Existing model credentials are not passed to Cognee, telemetry is disabled, and original files are unchanged.

Validation covers recursive discovery without course labels, duplicate provenance, workspace/selection/range isolation, deletion and changes, untrusted engine IDs, engine failure/cancellation, actual serialized answer context, restart reuse and UI status. Run typecheck, build, full existing tests, focused browser checks and a real Cognee probe separately. This task does not push or release.
