# Trefort — Application Consistency & Bug Audit

Date: 2026-11-14
Branch: `v0/emerickoffi-4213-1a0ffd66` (fix branch; not merged, not deployed)

## Audit scope

A code-level audit of routes, server actions, API routes, shared form components, database functions, and unit tests. It focused on the categories with the highest risk of data loss, financial errors, or authorization gaps. No redesign and no new features. No database migrations were applied, and nothing was written to the production database: every database query in this audit was read-only.

## Files and modules examined

- All `app/actions/*.ts` server actions: each exported function was checked for an auth/role guard (`requireManager`, `requireInvoiceManager`, `requireEditable`, and similar) before any data access.
- All `app/api/**/route.ts` handlers, including the cron route's secret check and the assistant and RFI improve routes.
- Storage access for quote attachments (bucket privacy and scoped policies).
- Financial mutations: `recordPayment`, `reversePayment`, `issueInvoice` (`app/actions/invoices.ts`), vendor bill approval and payments (`app/actions/vendor-bills.ts`), and the `record_invoice_payment` and vendor payment database functions.
- Form submission: every `<form action={...}>` and submit button, checked for a pending/disabled state.
- Unsaved-change guards: all eight `beforeunload` handlers (template editor, checklist form, subcontractor form, estimate sheet, estimate title grid, new quote request drawer, `SmartForm`, `FormOverlay`).
- Navigation: `lib/project-nav.ts`, `components/projects/project-tools-menu.tsx`, and the project layout.
- AI floating button and launcher actions: `lib/launcher-actions.ts`, `components/app/assistant-dock.tsx`.
- Feature registry: `lib/feature-registry.ts` compared against the live `public.feature_registry()`.
- Dev server logs, checked for hydration errors, failed requests, and console errors.

## Prior work confirmed in place

- The compact grouped Project Tools menu is implemented and merged to `master`.
- The AI floating button's Ask Question pill is implemented and merged. It opens the existing RFI drawer for the current project and never sends an RFI on its own. Questions (RFIs) is still reachable through project navigation.

## Summary table

| Module | Issue | Severity | Fix | Verification |
|---|---|---|---|---|
| Feature settings / Project Photos | The app offers a `project_photos` feature switch, but the live `feature_registry()` doesn't include that key. The migration `20270101000010_project_photos.sql` is in the repo but hasn't been applied. Turning Photos on or off will be rejected by the database. | High | Not fixed: applying the migration needs a separate review (per the audit constraints) | Blocked: confirmed by a read-only query of the live function definition, and by the failing test `feature-dependencies.test.ts` › "only offers switches for keys the database registry accepts" |
| Client Updates | "New client update" was a plain submit button with no pending state, and `createClientUpdateAction` doesn't deduplicate. A double click created two draft updates. | Medium | Replaced the button with the shared pending-aware `SubmitButton`, which disables while the request runs | Fixed but not browser-verified: type-check passes |
| Project navigation tests | `project-nav.test.ts` expected no Photos tool when all features are on. The navigation intentionally shows Photos under the same rule as `requirePhotosProject`, so the test was out of date. | Low | Updated the test expectation | Fixed and tested |

## Checked and found correct (no change needed)

- **Authorization:** every server action and API route checks auth or role before reading or writing data. The first automated sweep flagged several files, but they were false positives: those files use helpers such as `requireManager`, or delegate to a guarded helper. Each one was confirmed by reading the code.
- **Tenant scoping:** invoice and payment actions also filter by `organization_id`, and the database functions re-check manager role and project visibility.
- **Storage:** the quotes bucket is private, with scoped policies.
- **Financial retry safety:**
  - Invoice payments are protected by a request ID plus a hash of the payment details, under an advisory lock. A replay returns the original payment, and reusing a request ID with different details is rejected.
  - Vendor payments and vendor bill approval use idempotency keys.
  - No duplicate financial effects were found on retry.
- **Unsaved-change protection:** all eight guards register only while there are unsaved changes, or while a save is still in flight, so normal editing never triggers a warning.
- **Duplicate submit:** client updates was the only server-action create form without pending protection. The other unprotected forms are GET search/filter or sign-out forms, where a repeat submit does no harm.
- **Runtime:** no hydration errors, failed requests, or console errors in the dev logs.

## Changes made

- `app/(staff)/projects/[id]/client-updates/page.tsx`: the "New client update" button now uses `SubmitButton` (it shows "Creating..." and is disabled while pending).
- `lib/project-nav.test.ts`: corrected the out-of-date Photos expectation.
- `docs/TREFORT_APPLICATION_CONSISTENCY_AUDIT.md`: this report.

## Tests performed and actual results

| Check | Result |
|---|---|
| TypeScript (`tsc --noEmit`) | Pass |
| Production build (`next build`) | Pass |
| Unit tests (`npm test`) | 624 total: 623 pass, 1 fail (the `project_photos` registry blocker above, left failing on purpose so it isn't hidden) |
| Lint | Not configured (no lint script in `package.json`) |
| Integration / browser test suites | None exist in the repo |

## Remaining issues

1. **High, blocked:** apply `supabase/migrations/20270101000010_project_photos.sql` after review. Then add `'project_photos'` to `DB_REGISTRY_KEYS` in `lib/feature-dependencies.test.ts` and re-run `npm test`.

## Testing limitations

- **No browser verification.** The preview requires a signed-in staff account, and there is no isolated test database, so nothing was clicked through end to end. Responsive layouts (laptop, tablet, mobile) and visual consistency were not checked in a browser in this pass.
- **No database writes.** Create, update, and delete flows were checked by reading the code, not by creating records.
- **Phases 2 and 7 (visual and responsive consistency) were not audited screen by screen.** That needs a signed-in browser session.

## Required manual verification

1. On a project's Client Updates page, double-click "New client update": exactly one draft should be created.
2. After the Photos migration is applied, turn Project Photos off and on in feature settings and confirm the change saves.
3. Do a signed-in pass at laptop, iPad, and mobile widths across project tools, drawers, and tables.

## Final summary

1. Verified issues found: **3** (1 High, 1 Medium, 1 Low)
2. Fixed: **2** (the Medium and the Low); the High is blocked pending migration review
3. Tests: type-check pass, build pass, unit tests 623 passed and 1 failed (the known blocker)
4. Remaining blockers: unapplied `project_photos` migration; no signed-in browser session or isolated database for end-to-end checks
5. Files changed: `app/(staff)/projects/[id]/client-updates/page.tsx`, `lib/project-nav.test.ts`, `docs/TREFORT_APPLICATION_CONSISTENCY_AUDIT.md`
6. Pull request: opened as a draft from this branch (not merged)
