# Workspace memory trial implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline, with a fresh whole-change review after verification.

**Goal:** Automatically connect readable files in a workspace with Cognee and supply bounded, source-grounded evidence to normal questions.

**Architecture:** A workspace knowledge service owns discovery, deduplication, source validation and snapshot state. A Python worker owns the isolated Cognee process and returns only source item IDs. The existing context builder grants additional document/page access only for validated recalled evidence.

**Tech Stack:** TypeScript/Node 24, existing document parsers and SQLite, Cognee 1.6.5 with local models, React.

**Spec:** `docs/superpowers/specs/2026-10-19-workspace-memory-design.md`.

## Global constraints

- Baseline `197b64d9096fbe473a1b88f3af17a4aa14cb41f2`; preserve the 10 unrelated dirty screenshots.
- Work in the current checkout on `codex/workspace-memory-cognee`, as requested; no push/release.
- Originals, session isolation, configured page ranges and provider-default output limits are preserved.
- Settings are user-scoped; generated memory is workspace-scoped; credentials and local data never enter Git.

## Review focus

- A symlink, ignored file or filename resembling credentials must not enter indexing.
- Changed/deleted documents must not survive through stale engine matches or a failed rebuild.
- Selection-only questions and selected page ranges must not gain extra evidence.
- Shutdown, disable and overlapping refreshes must not race writes or leave worker processes running.
- Missing native dependencies or local models must be visible, with normal document reading still usable.

## Tasks

1. **Source-backed workspace service** — create `packages/contracts/src/workspace-memory.ts` and `packages/core/src/knowledge/{discovery,service}.ts`; write and observe failing integration tests for recursive discovery, deduplication, scope and freshness, then implement and verify them. Expose `sync`, `search`, `status`, `configure` and `close`; the engine consumes immutable source items and returns IDs only.
2. **Real Cognee runtime** — create `packages/core/src/knowledge/{cognee,process}.ts`, `plugins/workspace-memory/worker.py`, pinned requirements and setup/smoke scripts. Test subprocess protocol, refusal of invalid output, cancellation and unavailable runtime before implementation. Install isolated runtime and probe actual local ingestion and retrieval on synthetic documents.
3. **Application integration** — add authenticated workspace-memory routes, context attachment and compact sidebar panel. Add tests observing actual final model input/source grants, selection/range restrictions and UI lifecycle. Reuse existing source navigation.
4. **Verify and review** — run typecheck/build/full tests, browser checks and real-engine probe; independently review changed code, fix important findings and verify original dirty hashes. Document exact tested limits; keep the trial local and reviewable.

User's direct request to proceed with a trial is the execution authorization; do not require another planning approval. Track results in `.superpowers/sdd/2026-10-19-workspace-memory/progress.md`.
