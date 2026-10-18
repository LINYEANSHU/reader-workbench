# Explorer and shared selection controls — implementation report

Date: 2026-10-18. Scope: Task 1 of `docs/superpowers/plans/2026-10-18-reading-controls-translation.md` and its approved specification. No commit, push, reset, dependency change or original-document mutation was performed.

## Delivered

- `WorkspacePicker.tsx` is now an Explorer-style two-column browser: recent workspaces, available roots and a lazy expandable directory hierarchy on the left; immediate children and a current-directory filter on the right. Address entry, canonical breadcrumbs, back/forward (bounded to 50 successful locations), parent navigation and the complete committed selected path remain visible. The hierarchy expands only on request and stops at depth 12; deeper paths remain accessible through address/list navigation.
- Each central navigation has an AbortController plus a monotonic revision. Editing the address invalidates the previous request. Only the latest successful response can change the current path/history. Opening a manually typed address first resolves it through the browser endpoint, and only the canonical result can be posted as the workspace root. Browse failures preserve the last successful view and expose an error; they do not select the old folder for the new address.
- `SelectControl.tsx` provides controlled button/combobox, portal/listbox/option semantics, selected values, disabled options/control, optional search and no-results state. It supports arrows, Home/End, Enter/Space, Escape with focus restoration, Tab dismissal, type-ahead for non-searchable menus and pointer/outside dismissal. Menus use current theme tokens, viewport clamping and scroll/resize positioning, so scrolling containers cannot clip them.
- Appearance, composer model, model connection/protocol/catalog/default-depth and prompt/personalization style controls consume this shared component. Existing reasoning-effort slider/fallback behavior is unchanged. Global model/preferences persistence is unchanged.
- Root owns the temporary-branch replacement, generic API entry-point integration and existing E2E native-selector helper migration.

## Exact interfaces

```ts
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  description?: string;
}
export interface SelectControlProps {
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  'aria-label': string;
  disabled?: boolean;
  searchable?: boolean;
  className?: string;
  id?: string;
}
```

The exported `SelectControl` is in `apps/web/src/components/SelectControl.tsx`. Trigger and option buttons carry `data-value`; triggers expose `role="combobox"`, expanded/controls state and visible selected text. Options expose `role="option"`, selected/disabled state. The open list exposes `role="listbox"` with the supplied aria label. Search has the label `搜索` plus the control label. Styling classes are `.select-trigger`, `.select-popover`, `.select-options`, `.select-option` and `.select-search`.

```ts
export interface DirectoryBrowser {
  path: string;
  parent: string | null;
  entries: DirectoryEntry[];
  roots: DirectoryEntry[];
}
WorkspaceService.browseDirectoryBrowser(
  input: string, actor: Actor, workspaceId?: WorkspaceId
): Promise<DirectoryBrowser>
```

`GET /api/v1/directories/browser?path=...&workspaceId=...` is additive. The legacy `GET /api/v1/directories` continues returning `DirectoryEntry[]`. Local metadata resolves the directory through `realpath`, excludes hidden children/files as before, returns real parent/root metadata and available Windows drive roots (or POSIX `/`) plus home/current UNC root. The service retains the caller ownership gate when a workspace is supplied. Existing workspace providers still supply their legacy entries; browser parent/root metadata for those providers is lexical because their existing capability has no canonical-path metadata method.

## Files changed by this task

- `packages/contracts/src/workspaces.ts`
- `packages/core/src/workspaces/directory-browser.ts`
- `packages/core/src/workspaces/service.ts`
- `apps/server/src/routes/workspaces.ts`
- `apps/web/src/workspaces/WorkspacePicker.tsx`
- `apps/web/src/styles/workspace-picker.css` (new)
- `apps/web/src/components/SelectControl.tsx` (new)
- `apps/web/src/styles/controls.css` (existing user-owned untracked file, appended scoped menu rules)
- `apps/web/src/appearance/AppearanceSwitch.tsx`
- `apps/web/src/workbench/Composer.tsx`
- `apps/web/src/workbench/AgentPreferences.tsx`
- `apps/web/src/workbench/SettingsDialog.tsx`
- `tests/unit/directory-browser.test.ts` (new)
- `tests/e2e/directory-selection.spec.ts` (new)
- this report

Existing user-owned edits in these files were retained. This task did not edit `app.ts`, `Workbench.tsx`, `DocumentPane.tsx`, `api/client.ts`, `package.json`, SDK capabilities, memory or translation modules.

## Test-first evidence

1. `npx vitest run tests/unit/directory-browser.test.ts`: initial run failed 3/3 as intended: missing parent/browser helpers and metadata endpoint 404, while legacy endpoint returned 200. Implementation exposed a POSIX `/` terminal-root edge case, fixed with the same test. Final new/backend workspace run passed 11/11.
2. `npx playwright test tests/e2e/directory-selection.spec.ts --grep 'shared selectors'`: initial native UI failed because a keyboard-opened portal/listbox did not exist.
3. `npx playwright test tests/e2e/directory-selection.spec.ts --grep 'navigates|ignores'`: initial UI failed both tests because the committed selected-directory state did not exist.
4. Final scoped browser suite passed 3/3: canonical browsing/filter/history/up/open; delayed slow navigation followed by fast navigation with the exact selected canonical root asserted on POST; selector search, no-result/Escape/outside dismissal, focus restoration, selection persistence and menu bounds across all three themes at widths 1600 and 390. Intermediate test-author failures were corrected: the icon-only workspace button has no displayed workspace name (the test now asserts the actual posted root/file pane), and outside dismissal must click outside the popup rather than the textarea it overlays. The final complete browser run passed 3/3 (9.2 seconds).
5. `npx vitest run tests/unit/directory-browser.test.ts tests/integration/workspaces.test.ts tests/integration/agent-preferences.test.ts tests/integration/global-agent-settings.test.ts`: passed 20/20, including original protection, caller/workspace boundaries, global preferences/credential migration and actual request preference behavior.
6. `npx vite build --config apps/web/vite.config.ts`: passed; existing large-bundle warning remains. Root is coordinating the final complete build and full suite. The final option `data-value` integration attribute is included in source for root's next build.
7. Final fresh `npx tsc --noEmit` and `npx tsc --noEmit -p apps/web/tsconfig.json` both passed (exit 0). Earlier in-progress sibling integration produced DocumentPane/TranslationDialog/DocumentMemoryPanel prop errors and branded SessionId test errors; root was notified and those errors were absent in the final fresh checks.
8. Scoped `git diff --check`: passed, with only Windows line-ending warnings.

## Review boundaries and remaining verification

- Windows drive/UNC and POSIX parent arithmetic are deterministic unit checks. Live filesystem/API/browser checks ran on Windows; no macOS/Linux runtime or remote Actions result is claimed.
- Shared selectors use root CSS theme tokens; selected text uses `--text`, selected check/focus use the existing readable `--blue` token. No theme colors or reasoning levels were changed.
- Root owns the one batched visual inspection of all three themes/responsive overlays, the single Impeccable detector run, full typecheck/build and full regression suite. This subtask's browser bounds checks do not substitute for that visual review.
- Existing provider capabilities only return directory entries. Their metadata remains lexical; the local picker uses the canonical local endpoint without a workspace provider override.
- The initial/later typed address behavior remains compatible with existing `openWorkspace` fixtures: filling an address then choosing Open validates the address before selecting it.
