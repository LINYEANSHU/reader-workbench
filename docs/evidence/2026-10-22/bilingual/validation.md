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

## Dependency security verification — 2026-10-22

Local Windows verification of the dependency repair: Vitest 4.1.12, markdown-it 15.0.3, root `overrides` for KaTeX 0.19.0 and pptxgenjs' image-size 2.0.4, the audited tree published as `npm-shrinkwrap.json` in place of `package-lock.json`, and the patched runtime dependency subtrees bundled into the tarball.

| Check | Actual result |
| --- | --- |
| Official npm audit | `npm audit --audit-level=low --registry=https://registry.npmjs.org` reported 0 vulnerabilities (`github-security-audit-final.log`). |
| TypeScript | `npm run typecheck` passed for the server/core and browser projects (`github-security-typecheck-final.log`). |
| Focused distribution test | `npm test -- tests/integration/cli-distribution.test.ts --reporter=verbose` passed in 72.25 s with `npm_config_registry=https://registry.npmjs.org` and the real speech assets (`github-security-distribution-final.log`). The test installs the packed tarball into an empty prefix, parses the consumer's `install/package-lock.json`, and asserts that **every** nested katex, image-size and markdown-it entry satisfies katex ≥ 0.18.2, image-size ≥ 2.0.3 and markdown-it ≥ 15.0.3. It also asserts the tarball ships `npm-shrinkwrap.json` and the bundled runtime subtrees. Installed CLI startup without source links, `doctor` speech availability, packaged web assets, MCP stdio, plugin install, history restart, port conflict and actual SenseVoice transcription all pass. |
| Consumer install tree | A fresh `npm install` of the tarball produced 367 lock entries: one katex 0.19.0 and one image-size 2.0.4 under `node_modules/reader-workbench/node_modules`, markdown-it 15.0.3 at the consumer root, and no vulnerable copy anywhere in the tree (`consumer-install-evidence.json`). |
| Tarball | About 8.12 MB / 2,109 files. 89 bundled runtime packages ship with their required transitive files and licenses, and `npm-shrinkwrap.json` is retained. |
| Package privacy | The actual packed tarball contains no credentials, private instructions, logs, runtime or user data. |

### Consumer-install boundary

npm 11.19.0 ignores a dependency's packaged `npm-shrinkwrap.json` and the root `overrides` it declares when it installs a local `file:` tarball or runs `npm install --global /path/to/reader-workbench-0.4.0.tgz`. The package therefore no longer relies on either mechanism: the audited KaTeX and image-size subtrees (katex 0.19.0, image-size 2.0.4, rehype-katex 7.0.1, remark-math 6.0.0, pptxgenjs 4.0.1 and their runtime closure) are bundled inside the tarball through `bundleDependencies`, so local-tarball, global and future registry installs all receive the patched tree. The regression asserts that real consumer tree; the earlier version that inspected only the packaged lock was not counted as acceptance.

The packaged `npm-shrinkwrap.json` still records `registry.npmmirror.com` tarball URLs for 433 of its 460 resolved entries because it was generated against the local mirror. Bundled packages do not use those URLs, but a registry install that applies the shrinkwrap would fetch the remaining packages from that mirror; regenerate the lock against `registry.npmjs.org` before publishing if that is not intended.

These dependency checks are local Windows results. They do not establish macOS/Linux success; use the same pushed commit SHA in GitHub Actions to verify all three platforms.
