# Empty chats, missing workspaces and offline translation

User-authorized scope: keep all-archived chats empty until explicit creation; never recreate a deleted remembered workspace; deploy embedded offline Chinese/English translation without API setup. Existing work remains intact, with no commit/push before user review.

- [x] Reproduce last-chat archival/reload and deleted-folder startup failures with focused tests.
- [x] Remove replacement-chat creation for all-archived workspaces; preserve archived history and explicit restore/create, show safe inactive chat panes.
- [x] Validate remembered workspace roots before internal storage creation; startup skips unavailable roots and UI allows choosing another existing folder.
- [x] Deploy local CPU translation runtime and official Chinese/English packages in ignored application runtime; no global Python changes or inference network calls.
- [x] Wire offline translation as the default translation-only provider, retaining optional configured-model translation and existing preview/save formats.
- [x] Verify actual offline bilingual outputs, focused integration/browser regressions, typecheck/build, and hand changes to the user for review.

Root owns startup/workspace/chat/UI integration. Offline runtime agent owns only the new local provider/worker/installer/tests/assets/report. Existing translation format orchestration remains shared through its numbered-block interface.

Delivery and validation: docs/roadmap/2026-10-18-empty-workspace-offline-review.md.
