# Trefort — 20-Feature Commercial Readiness Audit

**Commit audited:** `master` @ `d0006a5`
**Method:** read-only. I read the source, read Supabase schema/RLS/storage-policy metadata (SELECT on catalog tables only), and ran the existing unit tests and `tsc --noEmit`.
**Not performed:** no browser click-through, no physical-device or camera testing, no records created, no migrations, no policy changes, no dependency installs.

## Classifications

| Label | Meaning |
|---|---|
| **Verified Working** | A passing automated test covers the behavior |
| **Implemented — Unverified** | Code path exists end to end, but no test or manual run confirms it |
| **Partially Working** | Some of the workflow exists, but a required step is missing |
| **Broken** | Evidence shows it fails |
| **Missing** | No implementation found |
| **Not Assessable** | Needs a browser, device, or external credentials I didn't have |

Code existence does not equal verified functionality. Nearly every UI behavior below is **Implemented — Unverified** at best, because no browser testing was done.

---

## 1. Executive summary

Trefort has an unusually deep core. Estimates, schedules, change orders, invoices, walkthroughs/punch lists, RFIs, daily logs, sub quotes, and warranty are all built with zod validation, org-scoped server actions, RLS on every table, and private storage buckets backed by 19 storage policies. The financial calculation libraries use integer cents and are covered by tests.

It is **not ready to sell** yet. The blockers are about workflows that stop halfway, not missing screens:

1. **Actual job cost has no input.** `vendor_bills`, `vendor_payments`, and `project_cost_forecasts` are read but never written by the app. There are no purchase orders. Profit and margin numbers can't be trusted.
2. **No outbound notifications.** No email provider is installed. RFIs, quote invitations (`subcontract_quote_outbox` has no dispatcher), assignments, invoices, and change orders depend on users logging in to notice.
3. **The homeowner can't approve anything in the portal.** Estimates and change orders are approved through Dropbox Sign or recorded by staff. The portal has no estimate, change-order, or selections pages, and no online payment.
4. **Selections and allowances aren't a feature.** "Allowance" exists only as an estimate line-item type. There are no selection tables or screens.
5. **Nothing runs on a schedule.** No `vercel.json` crons. Warranty processing runs only when an admin clicks a button.
6. **Offline is drafts-only.** `lib/device-drafts.ts` defines an IndexedDB pending-photo store, but `listPendingPhotos` is never called. Offline photo capture isn't wired up, and there is no service worker.
7. **CI is red.** 3 of 437 tests fail, and the quote-analysis test can't load because of the `@/` alias.

**Bottom line:** 4 features are close to sellable after verification (estimates, schedule, walkthroughs/punch, RFIs). 9 need a missing step finished. 5 are missing or mostly missing (POs/bills, selections, voice, QuickBooks, offline photos).

---

## 2. 20-feature status matrix

| # | Feature | Overall status | Biggest gap |
|---|---|---|---|
| 1 | Clients, Projects & Subcontractors | Implemented — Unverified | Three overlapping directories. Subcontractor list loads up to 5,000 rows with no paging |
| 2 | Estimates & Proposals | Implemented — Unverified (math **Verified**) | No portal review/approve page. No file import |
| 3 | Schedule & Task Assignments | Implemented — Unverified (logic **Verified**) | No holidays. No outbound notifications |
| 4 | Budgets & Job Cost | **Partially Working** | No way to enter actual costs |
| 5 | Invoices & Receivables | Implemented — Unverified | No online payment, no invoice email, no A/R aging |
| 6 | Change Orders & Homeowner Approval | **Partially Working** | Homeowner can't approve in the portal |
| 7 | Files, Photos & Role-Based Access | Implemented — Unverified (strong design) | Cross-tenant test not run |
| 8 | Walkthroughs & Punch Lists | Implemented — Unverified | Notifications are in-app only |
| 9 | Daily Logs with Photos | Implemented — Unverified | Photos need a connection. Offline queue unused |
| 10 | Sub Quote Requests & Comparison | Implemented — Unverified | Invitations aren't emailed (outbox not dispatched) |
| 11 | Purchase Orders & Vendor Bills | **Missing** | No PO entity. Bills have no write path |
| 12 | Homeowner Selections & Allowances | **Missing** | Only an estimate line-item type |
| 13 | RFI Management & Notifications | **Partially Working** | RFI workflow is built. Notifications aren't |
| 14 | Mobile/PWA Job-Site Experience | **Partially Working** / Not Assessable | Manifest only. SVG-only icon. No service worker |
| 15 | AI Daily Priorities & Next Step | Implemented — Unverified | Pull-only. No proactive daily digest |
| 16 | Voice-to-Log & Voice Commands | **Missing** | No speech or transcription code |
| 17 | AI Estimate Drafting & Quote Comparison | Implemented — Unverified | Quote-analysis test can't run |
| 18 | QuickBooks Integration | **Missing** | Status stub only, hard-coded `connected: false` |
| 19 | Offline Photo Capture & Sync | **Missing** (scaffold only) | Pending-photo store is never called |
| 20 | Advanced Reporting & Warranty Automation | **Partially Working** | Warranty runs only on a button. Reporting is limited to walkthrough PDFs and dashboards |

---

## 3. Findings and evidence by feature

### Features 1–4 (from the earlier audit, summarized)

**1. Clients, Projects & Subcontractors: Implemented — Unverified**
- `app/actions/clients.ts`, `projects.ts`, `subcontractors.ts`: zod validation plus `.eq('organization_id', session.organizationId)` on top of RLS.
- Clients are archive-only (`status='archived'`). One client can have many projects through `project_clients`. `createClientInlineAction` runs a duplicate check.
- Roles are `org_admin`, `project_manager`, `builder_staff`, `client`, plus a separate `/sub` portal. `builder_staff` can't create clients, subs, or estimates. Confirm that's intended.
- **Scalability defect:** the subcontractor directory loads up to 5,000 rows without paging.
- **Complexity:** Clients, Contacts (people/companies), and Subcontractors are three directories for overlapping data.

**2. Estimates & Proposals: math Verified, workflow Implemented — Unverified**
- `lib/estimate-sheet.ts` works in integer cents and milli-quantities, with markup and contingency covered by tests.
- Revisions: `create_estimate_revision` RPC and `/estimates/:id/compare`. AI draft: `createAssistantEstimateDraftAction`.
- Excel paste into the grid works. There is **no .xlsx/.csv upload** and no duplicate-line action.
- Approval happens through Dropbox Sign or a staff-recorded decision (`recordEstimateDecisionAction`). **No portal estimate page.**

**3. Schedule: logic Verified, UI Implemented — Unverified**
- Templates, custom phases, `@dnd-kit` reorder, list/timeline/calendar views, dependencies (cycle test), baselines.
- `business-days.ts` **does not exclude holidays**. No explicit milestone type was found. No outbound notifications.

**4. Budgets & Job Cost: Partially Working**
- The baseline is derived live from the single approved estimate (`resolveBaseline`, tested). Change orders roll into the revised budget (tested).
- Commitments are created only when a quote is awarded (`quote_create_commitment`).
- **`vendor_bills`, `vendor_payments`, and `project_cost_forecasts` have no insert/update anywhere in `app/`, `components/`, or `lib/`** (grep for `from('vendor_bills').insert|update|upsert` returns nothing). Actual cost stays at $0.

---

### 5. Invoices & Receivables: Implemented — Unverified

| Capability | Status | Evidence |
|---|---|---|
| Draft / issue / void / delete draft | Implemented — Unverified | `app/actions/invoices.ts`: `saveInvoiceDraft`, `issueInvoice`, `voidInvoice`, `deleteDraftInvoice` |
| Line items | Implemented — Unverified | `rpc('replace_invoice_lines')`. Atomic replace in the DB |
| Versioning / audit trail | Implemented — Unverified | `invoice_versions` (5 policies), `invoice_events` (5 policies) |
| Record payment | Implemented — Unverified | `recordPayment` → `rpc('record_invoice_payment')` with `dollarsToCents` and a `cents <= 0` guard |
| Reverse payment | Implemented — Unverified | `reversePayment`. A reversal instead of a delete is the right accounting pattern |
| Publish to homeowner | Implemented — Unverified | `setInvoicePublished`. `app/portal/invoices/page.tsx` comment says RLS returns only issued, published invoices on linked projects |
| Print / PDF | Implemented — Unverified | `app/(print)/invoices/[id]/print` |
| List filters / return navigation | **Verified** | `invoice-list-filters.test.ts` (9), `invoice-return.test.ts` (7) |
| Online payment (card/ACH) | **Missing** | No Stripe or other processor |
| Email invoice to client | **Missing** | No email provider |
| A/R aging, reminders, retainage, progress (AIA-style) billing | **Missing** | Not found |
| Link to estimate / CO / schedule-of-values | Not confirmed | Needs a browser check of the invoice form |
| QuickBooks sync | **Missing** | Feature 18 |

**Financial integrity:** Good. Payments and line replacement go through RPCs, payments are reversed rather than deleted, and amounts are stored in cents. **Risk:** I didn't read the RPC bodies, so overpayment checks (payment > balance) and the concurrency behavior of `record_invoice_payment` are **unverified**. That's a priority test.

---

### 6. Change Orders & Homeowner Approvals: Partially Working

| Capability | Status | Evidence |
|---|---|---|
| Create / edit / delete draft | Implemented — Unverified | `saveChangeOrderAction`, `deleteDraftChangeOrderAction` |
| Status workflow | Implemented — Unverified | `transitionChangeOrderAction`, `change_order_events` |
| Line items | Implemented — Unverified | `change_order_line_items` (3 policies) |
| Decision record | Implemented — Unverified | `decideChangeOrderAction` takes `decision_method` (enum `CHANGE_ORDER_DECISION_METHODS`) and an optional `signature_request_id` |
| Budget impact | **Verified** | `change-orders.test.ts` (9 tests), `financials.test.ts` |
| E-signature | Implemented — Unverified / Not Assessable | Dropbox Sign (`lib/esign/*`, webhook `app/api/webhooks/dropbox-sign`). Needs a live account |
| **Homeowner approves in the portal** | **Missing** | `decideChangeOrderAction` is called only from `components/change-orders/change-order-workflow.tsx` (staff). `app/portal` has no change-order route |
| Notify homeowner of a pending CO | **Missing** | No email. `PortalSignatureTasks` shows signature tasks only if a Dropbox Sign request exists |

**Integration:** The CO → revised budget link is real and tested. CO → invoice wasn't confirmed.

---

### 7. Files, Photos & Secure Role-Based Access: Implemented — Unverified (strong design)

| Capability | Status | Evidence |
|---|---|---|
| Private storage | Implemented | All 6 buckets have `public = false`: `project-documents`, `project-media` (50 MB), `subcontract-quotes`, `subcontractor-vetting`, `subcontractor-work`, `warranty-claims` (15 MB) |
| Storage policies | Implemented | 19 policies on `storage.objects`, each scoped by bucket and operation |
| Upload flow | Implemented — Unverified | `prepareDocumentUpload` → client upload → `registerDocumentVersion`. `discardDocumentUpload` cleans up orphans |
| Versioning | Implemented — Unverified | `project_document_versions`, `getDocumentHistory` |
| Visibility to homeowner | Implemented — Unverified | `setDocumentVisibility`. The portal documents page requires `role === 'client'` and `features.documents` |
| Short-lived URLs | Implemented | Signed URLs expire after 30 s (preview), 60 s (reports), and 300 s (client-update photos) |
| Archive | Implemented — Unverified | `setDocumentArchived` |
| Folder / tag organization | Implemented — Unverified | `lib/document-library-filters.ts` (tested) |

**Security note:** `getDocumentFileUrl` and `app/api/client-updates/photos/[id]` sign URLs with `createAdminClient()`, which bypasses RLS. That's safe **only if** the row is first fetched with the user-scoped client. The photo route reads `row.storage_path` before signing, so confirm that read uses the RLS client. **Priority check (see §5).** `project_documents` and `project_document_versions` each have only **1 policy**. That's likely a single `FOR ALL` policy, so confirm homeowners can't write through it.

---

### 8. Walkthroughs & Punch Lists: Implemented — Unverified

- Walkthroughs: `createWalkthroughAction`, homeowner responses (`saveWalkthroughResponse`, `submitWalkthroughAction` in `/portal/walkthroughs/[id]`), and a staff-conducted mode (`startStaffWalkthroughAction`, `/walkthroughs/[id]/conduct`).
- Issue lifecycle: `updateIssueAction`, `validateRepairAction`, `approveRepairAction`, notes/comments, `bulkUpdateIssuesAction`. `punch-list.test.ts` (5 tests) **verifies** the list logic.
- Subcontractor loop: `assignIssueSubcontractorAction` → sub `/sub/corrections/[issueId]` → `submitSubWorkAction` with evidence → `reviewSubSubmissionAction`. **This is a full closed loop across three parties, which is a strong differentiator.**
- Reports: `generateWalkthroughReportAction` produces a PDF. `builderSignoffAction`, `homeownerAcknowledgeAction`.
- Media: `media-uploader.tsx` uses `accept="image/*"`. Camera on mobile is **Not Assessable**.
- Live data: 160 `walkthrough_items`, 26 responses, so it has been used.
- **Gap:** `markNotificationReadAction` exists, but the only app-code writer to `notifications` is `lib/esign/sync.ts`. Issue and assignment notifications may come from DB triggers. **Unverified.**

---

### 9. Daily Logs with Photos: Implemented — Unverified

- `saveDailyLogAction`, `finalizeDailyLogAction` (locks the log), crews (`daily_log_crews`), activities (`daily_log_activities`), and weather (`app/api/weather`).
- Photos: `registerDailyLogPhotoAction`, captions, remove. `daily-log-photos.tsx:93` has **`capture="environment"`**, which opens the rear camera on phones (device behavior **Not Assessable**).
- Drafts: `resilient-save.tsx` retries up to 5 times on `online` events. `device-drafts.ts` stores text drafts in IndexedDB.
- Print: `app/print/daily-logs/[id]`.
- `daily-logs.test.ts` (12 tests) **verifies** the domain logic.
- **Gaps:** daily logs aren't shared with the homeowner (no portal route; client updates are a separate feature). No voice entry. Photos need a live connection.

---

### 10. Subcontractor Quote Requests & Comparison: Implemented — Unverified

- Staff: draft → send → invite companies → amend scope (`subcontract_quote_scope_versions`) → request revision → select/reject → award → commitment (`createQuoteCommitmentAction`).
- Sub portal: `/sub/quotes`, `/sub/quotes/[requestId]`, `saveQuoteDraftAction`, `submitQuoteAction`, `declineQuoteAction`, attachments in the private `subcontract-quotes` bucket.
- Comparison: side-by-side on the request page, plus AI analysis (`analyzeQuotesAction` → `subcontract_quote_ai_analyses`).
- Supporting: qualification/vetting (`subcontractor-qualification.test.ts`) and performance scoring (`subcontractor-performance.test.ts`) are **Verified** at the logic level.
- **Confirmed gap:** `subcontract_quote_outbox` has **0 RLS policies and no reader anywhere in `app/`, `lib/`, or `components/`**. Invitations are queued but never delivered, so subs learn about requests only by logging in.
- **Test gap:** `lib/ai/quote-analysis.test.ts` fails to load (`ERR_MODULE_NOT_FOUND '@/lib'`).

---

### 11. Purchase Orders & Vendor Bills: Missing

- No `purchase_orders` table, action, or screen (grep for `purchase_order|purchaseOrder` returns nothing).
- `vendor_bills` (3 policies) and `vendor_payments` (1 policy) exist and are **read** by `lib/job-costing-data.ts`, but nothing writes to them.
- The only commitment source is a quote award. Material suppliers, lumber yards, and T&M subs can't be represented.
- **This is the #1 financial-integrity gap.** Every margin figure in Feature 4 depends on it.

---

### 12. Homeowner Selections & Allowances: Missing

- No `selection` table or route. Grep for selection tables returns nothing.
- "Allowance" appears only as an estimate pricing type (`estimate-pricing-fields.tsx`, `estimate-sheet-row.tsx`) and in the budget's direct + **allowance** + contingency baseline.
- Missing: selection categories, options with pricing, a homeowner choose/approve step, deadlines tied to the schedule, and allowance-overage → automatic change order.
- This is a top-3 workflow for custom home builders and a common reason buyers pick a competitor.

---

### 13. RFI Management & Notifications: Partially Working

- Workflow: draft → send → amend → reassign → answer → comment → transition. Attachments go to a private bucket. `setRfiHomeownerSharedAction` controls homeowner visibility. API: `app/api/rfis/[rfiId]`.
- `isRfiOverdue` handles answered/closed RFIs correctly (`rfis.test.ts`, 9 tests). **Verified.**
- **Missing:** email notifications to the responder, due-date reminders, and an external (non-user) responder link. Responders must be app users.

---

### 14. Mobile/PWA Job-Site Experience: Partially Working / Not Assessable

| Item | Status | Evidence |
|---|---|---|
| Web manifest | Implemented | `app/manifest.ts`: `display: 'standalone'` and a theme color |
| Install icons | **Defect** | Only `/icon.svg` (`sizes: 'any'`). iOS ignores SVG for home-screen icons, and Android installability needs 192 and 512 px PNGs. Add `apple-icon.png` and PNG icons |
| Service worker / offline shell | **Missing** | No `serviceWorker`, `sw.js`, or Workbox |
| Camera capture | Implemented — Unverified | `capture="environment"` in daily logs and issue reports. `accept="image/*"` in walkthroughs and warranty claims |
| Responsive layout | Not Assessable | Tailwind breakpoints and a `mobile-nav.tsx` exist. Needs device testing |
| Tablet home | **Verified (logic)** | `tablet-home.test.ts` |
| HEIC / image downscaling before upload | Not confirmed | The 50 MB limit on `project-media` suggests full-size uploads. That's a cost and latency risk over cellular |

---

### 15. AI Daily Priorities & Next-Step Assistant: Implemented — Unverified

- `app/api/assistant/route.ts` (AI SDK 7 through AI Gateway). Tools: `getActionCenter`, `getCompletionReadiness`, `getProjectHealth`, `getConstructionBriefing`, `getConstructionMarketIntelligence`, `getEstimates`, `getInvoices`, `getSubcontractorQualification`, `proposeEstimateDraft`.
- Deterministic logic underneath is **Verified**: `next-actions.test.ts`, `project-next-action.test.ts`, `attention.test.ts`, `my-work.test.ts`, `lib/ai/project-health.test.ts`, `briefing-window.test.ts`, `assistant-scope.test.ts`.
- Requests are logged in `ai_assistant_requests` (RLS, 3 policies, about 51 rows).
- **Gaps:** pull-only (no morning digest or push). Read-mostly (the only write is proposing an estimate draft). A recent provider-error investigation added error classification. Confirm stability in production.

---

### 16. Voice-to-Daily-Log & Voice Commands: Missing

- Grep for `SpeechRecognition|webkitSpeech|transcri|MediaRecorder|getUserMedia` returns **nothing**.
- The AI Gateway is already wired up, so adding transcription to daily logs is a small addition.

---

### 17. AI Estimate Drafting & Quote Comparison: Implemented — Unverified

- Drafting: `lib/ai/estimate-draft.ts`, `estimate-draft-server.ts`, `createAssistantEstimateDraftAction`. It creates a **draft** for a human to review, which is the right safety posture.
- Market data: `lib/ai/market-*.ts` (`market-data.test.ts` **Verified**).
- Quote comparison: `lib/ai/quote-analysis.ts` → `subcontract_quote_ai_analyses`. **Its test file can't load**, so it has no running coverage.
- **Risk:** AI-generated cost numbers must be clearly labeled. Confirm the UI flags AI-sourced line items.

---

### 18. QuickBooks Integration: Missing

`lib/quickbooks.ts`:
```ts
// No OAuth connection flow or token storage exists yet, so a connection can never be verified.
return { credentialsConfigured, connected: false }
```
- Status UI appears on estimate and invoice pages (`components/estimates/quickbooks-panel.tsx`) and on `/settings/integrations`. **No OAuth flow, token table, or sync.**
- **UX risk:** showing "Setup Required" panels for something that can't be set up looks unfinished to buyers. Hide them until the integration exists.

---

### 19. Offline Photo Capture & Synchronization: Missing (scaffold only)

- `lib/device-drafts.ts` defines an IndexedDB store with `listPendingPhotos`, `countUserPhotos`, and `deleteUserDeviceData`.
- **`listPendingPhotos` has no callers** (only `lib/device-drafts.ts` references it). `daily-log-photos.tsx` doesn't queue anything offline.
- Text drafts and retry-on-reconnect (`resilient-save.tsx`) **do** exist. That's online-resilient, not offline-capable.
- There's no service worker, so the app won't load at all without a connection.

---

### 20. Advanced Reporting & Warranty Automation: Partially Working

**Warranty**
- Enrollment, completion-date correction, archive, claims from staff or homeowner (`warranty-claims.ts`, private bucket), portal `/portal/projects/[id]/warranty`, and follow-up tasks.
- `warranty-coverage.test.ts` (8 tests) **Verified**.
- **Automation isn't automatic:** `runWarrantyProcessingAction` (admin only) calls `rpc('process_warranty_schedule')` from `components/warranty/run-warranty-button.tsx`. There is no `vercel.json` cron and no `CRON_SECRET` route. `scheduled_job_runs` exists with 0 policies but has no scheduler. Anniversary milestones fire only when someone clicks the button.

**Reporting**
- Walkthrough PDF reports with sign-off. Activity-history export (`app/api/projects/[id]/activity-history/export`). Org financial metrics and portfolio dashboards.
- **Missing:** a report builder, scheduled or emailed reports, WIP / over-under billing, A/R aging, job-cost detail export, and CSV export of financials.

---

## 4. End-to-end workflow assessment

| Workflow | Status | Breaks at |
|---|---|---|
| Lead/client → project → team | Connected (unverified) | — |
| Estimate → revision → approval → budget | Connected **only via Dropbox Sign or a staff record** | No portal approval |
| Approved budget → change order → revised budget | **Connected, tested** | — |
| Quote request → sub bid → award → commitment | Connected (unverified) | Invitation never emailed |
| Commitment → PO → vendor bill → payment → actual cost | **Broken** | No PO, bill, or payment entry |
| Invoice → publish → homeowner views → payment recorded | Connected (unverified) | No online pay or email. Staff record payments by hand |
| Selection → homeowner choice → allowance overage → CO | **Missing** | — |
| Walkthrough → issue → sub correction → staff approval → report sign-off | **Connected (strongest loop)** | Notifications |
| Daily log + photos → homeowner update | Partial | Logs and client updates are separate. Manual re-entry |
| RFI → responder → answer → close | Connected (unverified) | No notification |
| Completion → warranty enrollment → milestones → claims | Partial | Milestones need a manual click |
| Field capture offline → sync | **Missing** | — |

**Duplicate or disconnected functionality**
- Clients vs. Contacts vs. Subcontractors directories (Feature 1).
- Daily logs vs. client updates: both are "what happened on site, with photos." Let a finalized log become a client-update draft.
- `warranty_followup_tasks` vs. the new `staff_tasks`: two task systems. Fold warranty follow-ups into staff tasks.
- `notifications` table vs. My Work / Action Center vs. My To-dos: three "what needs my attention" surfaces.

---

## 5. Security and multi-tenant assessment

**Strengths (verified from metadata)**
- RLS is enabled on every relevant public table. Server actions add `organization_id` filters on top of RLS.
- All storage buckets are private, with 19 bucket-scoped `storage.objects` policies. Signed URLs live 30–300 seconds.
- Money mutations go through RPCs (`record_invoice_payment`, `replace_invoice_lines`, `quote_create_commitment`, `duplicate_estimate`).
- Server-only tables (`scheduled_job_runs`, `subcontract_quote_outbox`) have 0 policies, so the anon key is denied.

**Risks to verify (priority order)**
1. **Service-role signing paths:** `getDocumentFileUrl`, `app/api/client-updates/photos/[id]`, and `app/api/reports/[id]` call `createAdminClient().storage...createSignedUrl`. Each must authorize the row with the user-scoped client first. Read each handler and add a cross-org test.
2. **Single-policy tables:** `project_documents` and `project_document_versions` (1 policy each), `vendor_payments` (1), and every `subcontract_quote_*` table (1 each). Confirm each one restricts writes by role, not just org.
3. **Portal role checks:** the portal documents page checks `session.role !== 'client'`. Confirm the same check on every `/portal/*` and `/sub/*` route and its server actions, not only in the layout.
4. **RPC bodies:** confirm `SECURITY DEFINER` functions validate `auth.uid()` membership and the org (`record_invoice_payment`, `process_warranty_schedule`, `quote_create_commitment`).
5. **Two-org penetration test:** not run (see the test plan in Appendix A).

---

## 6. Mobile/PWA readiness

| Area | Readiness |
|---|---|
| Installable PWA | **Low.** Manifest exists, but there are no PNG icons and no service worker |
| Camera capture | **Medium.** `capture="environment"` in daily logs and issues. Walkthroughs and claims use the gallery picker |
| Offline | **Low.** Text drafts only. The app shell won't load offline |
| Upload over cellular | **Unknown.** No client-side downscaling confirmed. Limits allow 50 MB files |
| Tablet | **Medium.** Tablet home logic is tested |
| Device testing | **Not performed** |

---

## 7. Critical defects and missing functionality

**Defects (confirmed)**
1. CI red. `project-nav.test.ts` is stale (expects `/estimates?project=`).
2. CI red. `directory-assignment.test.ts`: role suggestions return `''` instead of `'Foreman'`.
3. `lib/ai/quote-analysis.test.ts` can't run: `@/` alias is unresolved under `node --test`.
4. `subcontract_quote_outbox` is written but never dispatched.
5. Offline pending-photo store is dead code (`listPendingPhotos` has no callers).
6. PWA icon is SVG only, so it won't install properly on iOS or Android.
7. QuickBooks panels appear on estimates and invoices but can never connect.

**Missing (commercially required)**
1. Vendor bill, payment, and manual commitment/PO entry.
2. Outbound email for invites, RFIs, COs, invoices, and assignments.
3. Portal approval for estimates and change orders.
4. Selections and allowances module.
5. Scheduled jobs (warranty, reminders, overdue notices).
6. Online invoice payment.

**Missing (differentiators, can follow launch)**
Voice logs, offline photo sync, QuickBooks sync, report builder / WIP, holiday calendars.

---

## 8. UX simplification for small builders

1. **One Directory:** merge Clients, Contacts, and Subcontractors into tabs.
2. **One inbox:** merge Action Center, My Work, My To-dos, and notifications into a single "Today" view.
3. **Hide what can't be used:** QuickBooks panels and feature flags for unbuilt modules.
4. **Daily log → client update:** one click to publish a log's summary and photos to the homeowner.
5. **Explicit budget step:** small builders expect to see "Budget" as its own thing. Show the derived baseline with a clear "from Estimate Rev N" label and a one-click "set as budget."
6. **Role clarity:** document what `builder_staff` can do. Three staff roles may be more than a 5-person builder needs.

---

## 9. Prioritized commercialization roadmap

**Phase 0 — Make it trustworthy**
- Green CI (fix three test issues). Two-org security test suite. Audit the service-role signing paths.
- PNG/Apple icons.

**Phase 1 — Close the money loop**
- Vendor bills, vendor payments, manual commitments/POs, ETC forecasts → real job-cost and margin.
- Overpayment and concurrency tests on invoice-payment RPCs.

**Phase 2 — Close the communication loop**
- Email provider (for example Resend) plus a dispatcher for `subcontract_quote_outbox` and a general notification outbox.
- Vercel Cron for warranty processing, RFI/activity overdue reminders, and a daily priorities digest.

**Phase 3 — Homeowner self-service**
- Portal estimate and change-order review with approve/reject that writes the existing decision fields.
- Selections and allowances, with overage → change order.
- Online invoice payment (Stripe).

**Phase 4 — Field and differentiation**
- Service worker plus wiring the existing offline photo queue. Client-side image downscaling.
- Voice-to-daily-log through AI Gateway transcription.
- QuickBooks OAuth and sync (customers, invoices, bills).
- Reporting: WIP, A/R aging, job-cost export.

---

## 10. First five development tasks

1. **Vendor bill and payment entry (plus manual commitments)**, writing to the existing `vendor_bills`, `vendor_payments`, and `project_commitments` tables with org-scoped actions and cents-based validation. This unblocks every profitability number.
2. **Get CI green and add a two-org RLS/action test suite**, including the three service-role signed-URL routes.
3. **Transactional email and outbox dispatcher**: deliver quote invitations, RFI assignments, CO/estimate review requests, and invoice notices.
4. **Homeowner portal approvals**: `/portal/projects/[id]/estimates` and `/change-orders` with approve/reject, writing the same fields as `recordEstimateDecisionAction` and `decideChangeOrderAction`.
5. **Scheduled jobs**: a Vercel Cron route (secret-protected) that runs `process_warranty_schedule` per org and sends overdue reminders, recording runs in `scheduled_job_runs`.

---

## Appendix A — Isolated test plan (not executed)

Run this against a separate Supabase branch with synthetic data only.

1. Seed Org A and Org B, each with admin, PM, staff, homeowner, and sub users.
2. As each Org B user, read and write every table above with Org A IDs through the anon key and through server actions. Expect 0 rows and denied writes.
3. Request signed URLs for Org A documents, client-update photos, and reports as Org B. Expect 403.
4. Invoices: issue $1,000, pay $600, try paying $600 again (expect a rejection or a defined overpayment behavior), reverse a payment, and check the balance.
5. Change order: approve +$5,000 and confirm the revised budget and margin.
6. Walkthrough: homeowner submits → issue → assign sub → sub submits evidence → staff approves → report signed and acknowledged.
7. Mobile: on iOS Safari and Android Chrome, install the PWA, capture a daily-log photo with the camera, toggle airplane mode mid-draft, reconnect, and confirm the draft is restored.

## Appendix B — Baseline evidence

| Check | Result |
|---|---|
| `tsc --noEmit` | Pass, 0 errors |
| Unit tests | 434 / 437 pass (3 failures listed in §7) |
| Public tables with RLS | All relevant tables enabled |
| Storage buckets | 6, all private |
| `storage.objects` policies | 19 |
| Browser / device testing | **Not performed** |
