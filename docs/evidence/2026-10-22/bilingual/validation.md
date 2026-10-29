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

Local Windows verification of the dependency repair: Vitest 4.1.12, markdown-it 15.0.3, root `overrides` for KaTeX 0.19.0 and pptxgenjs' image-size 2.0.4, the audited tree published as `npm-shrinkwrap.json` in place of `package-lock.json`, and the patched runtime dependency subtrees injected into the packed manifest at `npm pack` time.

| Check | Actual result |
| --- | --- |
| Official npm audit | `npm audit --audit-level=low --registry=https://registry.npmjs.org` reported 0 vulnerabilities (`github-security-audit-final.log`). |
| TypeScript | `npm run typecheck` passed for the server/core and browser projects (`github-security-typecheck-final.log`). |
| Focused distribution test | `npm test -- tests/integration/cli-distribution.test.ts --reporter=verbose` passed in 72.25 s with `npm_config_registry=https://registry.npmjs.org` and the real speech assets (`github-security-distribution-final.log`). The test installs the packed tarball into an empty prefix, parses the consumer's `install/package-lock.json`, and asserts that **every** nested katex, image-size and markdown-it entry satisfies katex ≥ 0.18.2, image-size ≥ 2.0.3 and markdown-it ≥ 15.0.3. It also asserts the tarball ships `npm-shrinkwrap.json` and the bundled runtime subtrees. Installed CLI startup without source links, `doctor` speech availability, packaged web assets, MCP stdio, plugin install, history restart, port conflict and actual SenseVoice transcription all pass. |
| Consumer install tree | A fresh `npm install` of the tarball produced 367 lock entries: one katex 0.19.0 and one image-size 2.0.4 under `node_modules/reader-workbench/node_modules`, markdown-it 15.0.3 at the consumer root, and no vulnerable copy anywhere in the tree (`consumer-install-evidence.json`). |
| Tarball | About 8.04 MB / 2,107 files in the clean-build verification (the preceding warm-tree pack was 8.12 MB / 2,109 files). 89 bundled runtime packages ship with their required transitive files and licenses, and `npm-shrinkwrap.json` is retained. |
| Package privacy | The actual packed tarball contains no credentials, private instructions, logs, runtime or user data. |

### Consumer-install boundary

npm 11.19.0 ignores a dependency's packaged `npm-shrinkwrap.json` and the root `overrides` it declares when it installs a local `file:` tarball or runs `npm install --global /path/to/reader-workbench-0.4.0.tgz`. The package therefore does not rely on either mechanism for consumers: the audited KaTeX and image-size subtrees (katex 0.19.0, image-size 2.0.4, rehype-katex 7.0.1, remark-math 6.0.0, pptxgenjs 4.0.1 and their runtime closure) are injected into the **packed** manifest by the `prepack` hook and restored by `postpack`, so local-tarball, global and future registry installs receive the patched tree. The bundle list is deliberately absent from the source `package.json`: npm treats a root `bundleDependencies` entry as a bundled node, validates it against each dependent's raw version range and ignores overrides, which made a cold `npm ci` loop on katex 0.19.0 versus `^0.16.0`. The regression asserts the real consumer tree and that the source manifest stays unbundled.

The previous packaged lock used `registry.npmmirror.com` for 433 resolved tarballs. All 454 resolved tarball URLs in the current `npm-shrinkwrap.json` now point to `registry.npmjs.org`; the clean cold install below downloaded from that registry and verified every integrity hash.

## Cold source-install regression — CI run 39744908034

The pushed commit `34a0219285590aeb0c38aff29e35138c14a6281a` was not green. macOS job `119710842611` failed in `npm ci` after about 513 s (Node 24.21.0, npm 11.19.0, default ≈2048 MB heap) with `FATAL ERROR: Ineffective mark-compacts near heap limit`, exit 134; no test suite started. Windows was still running and Linux Office provisioning was pending when this was recorded.

| Check | Actual result |
| --- | --- |
| Local reproduction | A fresh `git archive` checkout with the failing manifest, run with `node --max-old-space-size=2048 npm ci --dry-run --ignore-scripts --no-audit`, reproduced the failure: exit 134 after 320.5 s. The npm debug log showed the same `placeDep ROOT katex@0.19.0 REPLACE` pair repeating without bound. |
| Isolated cause | Removing only the root `bundleDependencies` array made the same dry-run succeed in 0.9 s. Bundle-listed katex ignores the override, so rehype-katex/remark-math's `^0.16.0` edge stays invalid and Arborist re-places/replaces katex forever. |
| Clean source install | Final source with a fresh npm cache: `node --max-old-space-size=2048 npm ci` (default scripts, full dev dependencies, audit enabled) passed in 49.9 s, `added 395 packages`, `found 0 vulnerabilities` (`cold-ci-repair-final-ci.log`). |
| Build | `npm run build` passed in 6.7 s (`cold-ci-repair-build.log`). |
| TypeScript | `npm run typecheck` passed for the server/core and browser projects in 5.3 s (`cold-ci-repair-typecheck.log`). |
| Official npm audit | `npm audit --audit-level=low --registry=https://registry.npmjs.org` reported 0 vulnerabilities (`cold-ci-repair-audit.log`). |
| Distribution test | `npm test -- tests/integration/cli-distribution.test.ts --reporter=verbose` passed in 61.8 s with the real speech assets. The packed tarball (89 injected bundles, `npm-shrinkwrap.json` retained) installed into an empty prefix; source links absent, consumer lock asserted every katex ≥0.18.2, image-size ≥2.0.3 and markdown-it ≥15.0.3, and CLI/doctor, web assets, MCP stdio, real SenseVoice transcription, restart and port conflict all passed (`cold-ci-repair-distribution.log`). |
| Pack hooks | `npm pack --json` injected 89 bundles into the packed `package.json` (8,039,268 bytes, 2,107 files) and restored the source manifest with no backup left behind (`cold-ci-repair-pack.log`). |

These are local Windows results at a 2048 MB heap. They do not show macOS/Linux success for this change; the failed `34a0219` run is not counted as a pass. Use the **same pushed commit SHA** in [GitHub Actions](https://github.com/LINYEANSHU/reader-workbench/actions/workflows/ci.yml) to verify all three platforms.
