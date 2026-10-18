# Independent review — reading controls and translation

Review date: 2026-10-18. Reviewed the approved specification, implementation plan, controls/translation reports and current source. This is a review of the requested feature seams, not a review of the 94 pre-existing dirty files. No implementation files were changed, and no commit or push was performed. The concurrent DOCX run-grouping and demo-memory fixes are excluded from findings.

## Findings

### 1. [P1] Restrict the overview model request to the selected reading range — fixed and re-reviewed

Location: `plugins/visual-document-memory/reading.mjs:28` (`summarize(host, record.pages.map(...))`).

After a document has cached pages and the user selects a disjoint range containing an unread page, the page-reading request respects the range but the overview request serializes every cached page. Reproducer: prepare text-mode page `[1]` with summary `SECRET_PAGE_1`, change `host.readingPages` to `[2]`, and prepare again. Running the actual module produced an overview request containing both `{"page":1,"summary":"SECRET_PAGE_1",...}` and page 2. Thus content explicitly excluded from the current range is still sent to the configured model. Filtering only the final answer context does not repair this earlier request. Summarize selected pages, and associate/rebuild the overview with its covered range so narrowing to an already cached subset cannot reuse an overview containing excluded pages. Add a disjoint-range request-capture regression, not only an expanding-range check.

Verification: actual `prepare()` invocation with an in-memory host and captured model requests; confirmed excluded page 1 in the overview request.

### 2. [P1] Apply the reading range to ordinary source-reading tools too — fixed and re-reviewed

Locations: `packages/core/src/sessions/context.ts:49` (advertises every read tool), `packages/core/src/tools/builtins.ts:11`–13 (unrestricted page/block/search execution).

The new memory tools check `run.context.documentMemories[].completedPages`, but the same run still receives `read_document_page`, `read_document_block` and `search_document`. These tools only construct a workspace-scoped document reference and return arbitrary pages or full-document search hits. Reproducer: establish a run with selected pages `[2]`, then have a tools-capable provider request `read_document_page` for page 4 (or search a phrase unique to page 4). The source tool returns that excluded content even though `read_document_memory` correctly rejects page 4. ToolExecutor does not supply a compensating range check; it validates input schema and workspace identity. Persist an explicit per-run document/page or selection scope and enforce it consistently on source tools, including search results and blocks. Keep the authorization pinned to the run rather than consulting a mutable current plan.

Verification: source-path review from ContextBuilder through ToolExecutor plus an actual built-in tool invocation showing page 4 is passed through and returned with no range authorization. This direct probe did not simulate a complete provider tool-loop run; add that integration regression.

### 3. [P2] Do not reinterpret protected code as Markdown image resources — fixed and re-reviewed

Locations: `plugins/document-translation/translation.mjs:23`–27 (`portableMarkdown` runs after protected code is restored).

The resource regex scans the entire restored document, including fenced and inline code. A valid Markdown document containing `Hello`, followed by a fenced `md` example `![example](images/example.png)`, is therefore made to read `images/example.png`. The normal Markdown resource snapshot correctly ignores code examples, so translation fails with `TRANSLATION_RESOURCE`. If that resource happens to exist, the code example is instead rewritten to a data URI, violating code preservation. Running the actual translation module confirmed `RESOURCE_REQUEST images/example.png` followed by the resource failure. Resolve and replace only actual Markdown image nodes while leaving code/math regions byte-identical; the existing Markdown parser-based resource extraction is a suitable source of consistent semantics. Include both an absent example image and a real image alongside the same code example in regression coverage.

Verification: actual `translateDocument()` call, deterministic valid model response, `readResource` rejecting the non-snapshotted code-example path.

### 4. [P2] Handle page-level memory links for Markdown and plain text — fixed and re-reviewed

Location: `apps/web/src/workbench/DocumentPane.tsx:28` (only handles block anchors; page anchors are passed only to PdfViewer).

The memory plugin intentionally falls back to a page-level source whenever the generated Chinese description is not an exact substring of a text block, which is the normal case for translated formula/term explanations. Markdown/text documents have a synthetic source page 1. Their search result displays an enabled “第 1 页（页级定位）” button, but clicking it merely assigns `memoryNavigation`; neither the Markdown/text render path nor the navigation effect consumes a page anchor. Reproducer: open a long Markdown document, build a term/formula entry with a Chinese explanation not literally present in a source block, scroll below the top, search the entry and click its source link. The click does not navigate. Provide an explicit page-container/top-of-document fallback for page 1, while keeping the page-level uncertainty label; do not fabricate a precise block.

Verification: static trace of entry-source construction, search-result click handler, DocumentPane navigation effect, and MarkdownViewer DOM (block attributes only). A browser regression should confirm the scroll position changes for the page-level fallback.

## Review boundaries

- The first and third findings were reproduced directly against the current JavaScript modules. The second also has a direct source-tool execution probe; the fourth is a complete source-level UI trace.
- Existing supplied test results were not represented as fresh review-run results. Full final typecheck/build/suite and browser checks remain owned by the integrating agent.
- No live-model translation quality, cross-platform runtime verification or remote CI result is claimed.
- Concurrent agents may subsequently fix the findings above; this report records the reviewed snapshot and should be annotated with follow-up verification rather than treated as proof they remain present.

### 5. [P2] Recheck cancellation after the final asynchronous authorization — fixed

Location: `packages/core/src/documents/processing.ts:43`–44 (the `authorizeScope` await between the last abort check and publishing `entry.result` / `status='ready'`).

A cancellation can be overwritten by a late successful completion. Reproducer: let the processor finish, hold the second `repository.authorizeScope()` call pending, call `cancel()`, then resolve the authorization. The actual service returned `CANCEL_RESULT cancelled`, followed by `FINAL_STATUS ready`; `preview()` then returned the cancelled task's bytes. The signal is checked immediately before that await, so the continuation never observes the cancellation that happened during authorization. Save remains protected by its separate aborted-signal check, but the UI receives a resurrected ready preview whose save action can never work, and cancelled data becomes previewable again. Recheck the signal after the await and immediately before publishing the result. Add a deferred-authorization race test in addition to the existing late-processor cancellation test.

Verification: deterministic actual `DocumentProcessingService` invocation with a deferred second authorization; observed cancelled -> ready and preview byte length 1. No source file was modified by the probe.


Follow-up fix (2026-10-18): added an abort check immediately after the final completion authorization resolves. Added a deterministic deferred-authorization unit regression covering final cancelled status, absence of preview metadata, preview/save refusal, and no artifact publication. RED: targeted regression failed with expected cancelled / received ready. GREEN: `npx vitest run tests/unit/document-processing.test.ts tests/integration/document-processing-api.test.ts` passed 6/6 across 2 files. Full-suite acceptance remains with the integrating agent.

## Bounded follow-up acceptance — 2026-10-18 16:43 local time

All five original findings are closed for the reviewed paths. This follow-up changed no implementation or test source. It refreshed the generated web bundle for a browser check and updated this report. The original descriptions above remain as the regression evidence, not as claims that the bugs are still present.

1. **Overview scope:** `prepare()` summarizes only selected pages and persists `overviewPages`; narrowing, disjoint ranges and legacy broader overviews cause a scoped overview rebuild without discarding reusable page memories. `scopedMemoryOverview` prevents use of a differently scoped overview. The six reading-plan-memory tests passed in this review, including disjoint and legacy/narrowing request capture.
2. **Source-tool scope:** current runs persist `ContextEnvelope.documentReadScopes`; source tools verify caller/session, requested and contextual document version, selection exclusion and pinned pages. No-memory fallback also pins/filter pages, and search filters before ranking/limiting. The previous missing-memory/foreign-version fail-open path is closed for current runs. Context transforms cannot mutate pinned scopes. Source ranges now start empty, so historical anchors are not emitted as current citations. Existing conversation/history messages remain available intentionally: adjusting a reading plan limits fresh document reads, it does not erase prior conversation. Six real-document source-scope tests and five targeted reading-plan integration tests passed, including selection-only rejection, known foreign-document rejection, no-memory fallback, page 129 search, narrowed current citations and retained cross-document/temporary-chat history.
3. **Markdown code examples:** `portableMarkdown` masks fenced/inline code before image-resource processing and restores it afterward. The 15 translation unit tests passed, including a document containing absent code-example image paths alongside a real snapshotted image; only the real resource is fetched and code bytes remain literal. This closes the reported fenced/inline-code case; it is not a claim that every possible Markdown grammar variant was exhaustively tested.
4. **Text page-level navigation:** current DocumentPane verifies document/version, clears precise block highlighting and sets the Markdown/text page-1 container scroll position to zero. The browser test initially failed because the test server served an older prebuilt web bundle that still highlighted the first block. After `npx vite build --config apps/web/vite.config.ts`, the unchanged test `opens a page-level Markdown memory result at its actual text source` passed (1/1), asserting zero fabricated highlights and scrollTop below 10. Build passed with the existing large-chunk warning.
5. **Cancellation:** the post-authorization abort check remains directly before result publication with no additional asynchronous gap. The deferred-authorization regression and all five processing unit tests passed; the authenticated start/poll/preview/save/cancel API integration test also passed. Cancelled work stays cancelled, exposes no preview and cannot save. No further issue was found in this bounded cancellation recheck.

Fresh commands/results:

- `npx vitest run tests/unit/reading-plan-memory.test.ts tests/integration/reading-source-scope.test.ts tests/unit/document-translation.test.ts tests/unit/document-processing.test.ts tests/integration/document-processing-api.test.ts` — **33/33 passed** across five files.
- `npx vitest run tests/integration/reading-plans.test.ts -t 'emits only|disabled|demo|selection text'` — **5/5 selected tests passed**, five deliberately not selected.
- `npx vite build --config apps/web/vite.config.ts` — passed; existing bundle-size warning only.
- `npx playwright test tests/e2e/reading-workflow.spec.ts --grep 'page-level Markdown'` — **1/1 passed after refreshing the bundle**; the earlier stale-bundle failure is recorded above.

Full-suite acceptance, full browser-suite acceptance, live-model quality and cross-platform CI remain outside this follow-up. No commit or push was performed.