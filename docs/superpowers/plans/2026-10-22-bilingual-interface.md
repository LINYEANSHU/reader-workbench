# Bilingual Interface Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement the independent UI groups and review the integrated result.

**Goal:** Ship switchable Chinese/English UI and matching READMEs while retaining document and model content.

**Architecture:** Shared locale store and paired-string helper; components subscribe and localize only application chrome. Language selection persists in browser storage without remounting the workbench.

**Tech Stack:** Existing React 19, TypeScript, Vite, Vitest and Playwright; no new dependencies.

**Spec:** docs/superpowers/specs/2026-10-22-bilingual-interface-design.md

## Global Constraints

- Default Chinese; support `zh-CN` and `en`; preserve user-authored content and API data.
- Preserve existing changes and local private configuration. Agents.md, logs, credentials and runtime assets remain excluded.
- Final pushed SHA must pass all Windows, macOS and Linux workflows.

## Review Focus

- A language change must not clear drafts, selections, active sessions or other workspace state.
- Module-level label arrays and memoized labels must respond to the selected locale.
- Localized text must not become an API identifier, target language value or document/model content.
- Long English labels and accessible names must work in narrow windows.
- Storage errors and stale asynchronous responses must leave the UI usable.

### Task 1: Locale infrastructure and shell integration

- [ ] Add failing locale-store/interpolation tests and English browser smoke tests; verify failure.
- [ ] Implement locale store, language selector, document language/title, English-aware error presentation and supporting styles.
- [ ] Integrate welcome/workbench shell, workspace picker/sidebar, layout and model settings with bilingual labels.
- [ ] Check persistence, switching without lost drafts and current Chinese flows.

### Task 2: Reading and translation surfaces

- [ ] Localize document controls/viewers, source navigation, reading ranges/memory, translation and selection controls.
- [ ] Preserve actual document text, targetLanguage API values, source anchors and filenames.
- [ ] Verify English reading/translation flows and existing Chinese regressions.

### Task 3: Tools, chat and diagnostics surfaces

- [ ] Localize chat chrome, agent settings, usage summaries, plugins, capture and speech controls/errors.
- [ ] Preserve conversation bodies, authored prompts and model/shortcut identifiers.
- [ ] Verify relevant browser flows and long labels.

### Task 4: Documentation and release checks

- [ ] Update Chinese README, create full English README, cross-link them and document locale and experimental memory.
- [ ] Refine ignore rules and verify npm package contents, credentials and local instructions exclusions.
- [ ] Review integrated changes, run all local checks and real installed optional engines.
- [ ] Commit scoped files, push a fast-forward update and wait for all checks at the final SHA.
