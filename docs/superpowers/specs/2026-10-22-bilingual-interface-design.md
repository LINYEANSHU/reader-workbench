# Bilingual Reader Workbench

The browser workbench supports Simplified Chinese and English through one implementation. Chinese remains the default. A language control is available before selecting a workspace and in the workbench toolbar. The browser remembers the choice across reloads and workspace changes; `html.lang` and the document title follow it. Storage failures retain a working in-memory choice.

Translate application navigation, settings, controls, tooltips, accessible names, empty/loading/error states and status summaries. Preserve document text, filenames, paths, chat history, generated content, API identifiers, translation target values and user-authored prompts. Selecting an interface language does not rewrite persisted user data or alter model requests.

Use a small typed TypeScript translation helper with paired Chinese/English strings and named placeholders, plus a subscribed locale store. Components subscribe with `useLocale()` and call `t(zh, en, values?)`; helpers may call `t` when an operation occurs. No DOM text mutation, browser translation, new service or dependency is needed.

Application error state retains original diagnostics and translates them at render time, so parameterized errors also follow subsequent language changes.

Keep the existing appearance tokens and three-pane workflow. English expansion must wrap or fit existing controls at desktop and narrow widths. README.md remains the Chinese entry; README.en.md is the complete English counterpart with reciprocal links. Both distinguish published 0.4.0 from subsequent source changes and describe workspace memory's experimental boundaries.

Validation includes locale persistence/fallback and interpolation units, English browser flows and Chinese compatibility, the workspace-memory regressions, typecheck, build, all core/browser tests, real installed optional engines, README/package/secret checks, and the final SHA's Windows/macOS/Linux Actions.
