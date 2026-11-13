# Trefort — Procurement & Financial Audit (Milestone 1)

Audit date: 2026-11-12 · Branch base: `master` @ `8bc85971`
Scope: Phases 0 and 1 of the Procurement → Profitability specification. **No application code, schema, or data was changed in this milestone.**

## How this audit was performed

| Evidence source | What was checked |
|---|---|
| `supabase/migrations/*` (86 files) | Tables, constraints, guards, RLS policies, RPCs |
| Live database (read-only `HEAD` count probes, no row data read) | Whether each table exists in the connected Supabase project |
| `lib/`, `app/`, `components/` | Calculations, server actions, UI surfaces |
| `node --test` on financial test files | 58 / 58 tests passed (job-costing, job-cost-sources, vendor-bills, financials, estimate-financials, ai/quote-analysis, ai/project-health) |

Live row counts at audit time: `project_commitments`, `vendor_bills`, `vendor_payments`, `project_cost_forecasts`, all `subcontract_quote_*` tables, `invoice_payments`, and `schedule_activity_assignments` exist but contain **0 rows**. Therefore no procurement or cost workflow has been exercised end-to-end against the real database. Many migrations are still headed `FOR REVIEW — NOT YET APPLIED`, but their tables do exist live, so those comments are stale.

## Classification summary

Legend: **VW** Verified Working · **IU** Implemented — Unverified · **PI** Partially Implemented · **M** Missing · **B** Blocked

| # | Capability | Status | Evidence / gap |
|---|---|---|---|
| 1 | Subcontractor directory & qualification | IU | `subcontractor_companies`, qualification policies, vetting stages, ratings, `subcontractor_qualification_status()`; enforced in `quote_select` |
| 2 | Project-specific sub assignments | IU | `subcontractor_project_assignments` (+history), `schedule_activity_assignments` (0 rows) |
| 3 | Quote requests & sub submissions | IU | `subcontract_quote_requests / scope_versions / invitations / revisions / attachments / events`; one draft per invitation; append-only history; `quote_draft_save`, `quote_submit`, `quote_decline`; sub portal `app/sub/(workspace)/quotes` |
| 4 | Bid comparison & award | IU | `subcontract_quote_awards` (unique per request ⇒ one winner), `quote_select` with row lock, scope-version and outstanding-revision checks, warning acknowledgement, idempotent replay; `quote_reject`; private append-only review notes. **Split awards are intentionally unsupported.** |
| 5 | Work orders / subcontract agreements | **M** | No `work_order` entity, number, document, issuance, or acknowledgement anywhere. The award can create a **draft** commitment directly (`quote_create_commitment`), skipping a work-order document. |
| 6 | Estimate & budget line items | IU | Approved estimate = baseline (`lib/financials.ts › resolveBaseline`); original cost = direct + allowance + contingency |
| 7 | Cost codes / categories | PI | Fixed 21-value list `is_cost_category()` + code groups in `lib/job-costing.ts`. Not tenant-configurable (acceptable for now). |
| 8 | Purchase orders | PI | `project_commitments.commitment_type` supports `purchase_order`; no separate PO document/flow |
| 9 | Vendor bills, payments | IU | `vendor_bills` (draft → approved → voided), duplicate-invoice unique index, `idempotency_key`, link guard (bill → approved commitment only), `record_vendor_payment` (idempotent, cannot exceed balance, row lock), `reverse_vendor_payment`; UI `components/financials/bills-workspace.tsx` |
| 9a | Overbilling vs commitment | PI | Cumulative billed is shown; **no server-side flag/authorization route** when approved bills exceed the commitment |
| 9b | Bill correction | PI | Void with reason exists; no "returned for correction" state, no credit memo |
| 9c | Retainage | M | Not modelled |
| 9d | Sub-submitted bills (portal) | M | Subcontractors cannot submit bills or see payment status |
| 10 | Change orders (customer) | IU | `change_orders` + lines + events; approved cost/price adjustments feed revised budget & contract |
| 10a | Sub work-order / commitment changes | **M** | No commitment revision table; approved commitments are immutable, so a $2,500 increase can only be entered as a *second* commitment (no linked audit chain) |
| 11 | Documents & templates | IU | Company document library, `document_template_lifecycle`, e-signatures (Dropbox Sign). Not yet used for work orders. |
| 12 | Schedule & assignments | IU | Schedule activities (228 rows live), phases, `schedule_activity_assignments`. No link from award/commitment to activity. |
| 13 | Financial dashboard calculations | IU (logic VW by unit tests) | `lib/job-costing.ts › summarizeJobCost`, Financials page with Budget, Commitments, and Bills workspaces |
| 14 | AI quote analysis | IU | `lib/ai/quote-analysis.ts` + `subcontract_quote_ai_analyses` (feature-gated, persisted) |
| 14a | AI financial insights | PI | Assistant retrieval exposes *estimate* financials only to managers; does **not** read commitments, bills, payments, or forecasts. `project-health` financial rule compares estimate vs. budget only. |
| 15 | Notifications | PI | `email_outbox` statuses `queued/sending/accepted/failed/skipped` (no "delivered"), `notification_email_preferences`, `subcontract_quote_outbox` with retry. No events for bills, payments, or commitments. Delivery is unverified. |
| 16 | Tenant isolation / roles / RLS | IU | `can_manage_project_costs` = org manager AND internal project access; all job-cost tables are RLS-protected with no DELETE policies; `supabase/tests/tenant_isolation` exists but its coverage of cost tables was not run in this audit |
| 17 | Transactions / idempotency / audit | IU | Idempotency keys on commitments, bills, payments, invoice payments; `client_save_requests`; `write_audit_event` triggers on all cost tables (`audit_events` 319 rows live) |
| 18 | Test suites / browser testing | PI | 72 `node --test` unit files (pure logic); 2 SQL test suites; **no** integration or E2E tests for procurement or job-cost workflows |
| — | Daily Priorities (financial) | PI | Quote-related priorities exist (`lib/daily-priorities.ts`); no bill-due, unapproved-bill, over-commitment, missing-forecast, or margin-decline priorities |
| — | Homeowner exposure | IU | No portal code references `vendor_bills`, `project_commitments`, or `subcontract_quote_*`; RLS requires internal access. Needs a negative-access test. |

**Actual-cost tracking is not missing.** It exists and follows accrual-style recognition on bill approval. The critical gaps are elsewhere:
1. Work-order entity and document (Phase 7)
2. Commitment change history (Phase 11)
3. Overbilling exception flow (Phase 9)
4. Sub-portal billing (Phase 9 / 16)
5. AI and priorities reading job-cost data (Phases 13–14)
6. Zero end-to-end verification against the database

## Current table relationships

```
estimates (approved) ──► baseline: original cost budget + contract price
change_orders (approved) ──► cost_adjustment → revised budget · price_adjustment → current contract
                                                    
subcontract_quote_requests ─┬─ scope_versions (append-only)
                            ├─ invitations (one per company) ── revisions (versioned; 1 draft max)
                            ├─ events (append-only) · review_notes (append-only, builder only)
                            ├─ ai_analyses (advisory, persisted)
                            └─ awards (UNIQUE request_id) ──► project_commitments.source_quote_award_id (UNIQUE)

project_commitments (draft → approved → closed | cancelled)
   └─ vendor_bills.commitment_id (must be approved commitment)
         └─ vendor_payments.bill_id (approved bills only; Σ ≤ bill amount)
project_cost_forecasts (one manual ETC per project+category)
invoices / invoice_payments  ── homeowner billing (revenue side; separate)
```

## Phase 1 — Financial definitions as implemented (authoritative)

All money is integer cents (`bigint`); margin uses integer basis points rounded half away from zero. The application uses **accrual recognition at bill approval**, which is not cash basis.

| Term | Formula in code (`summarizeJobCost`) | Notes |
|---|---|---|
| Original cost budget | approved estimate direct + allowance + contingency | Unallocated difference row keeps categories reconciled |
| Current cost budget | original + Σ approved change-order cost adjustments | Per category from CO lines |
| Original contract value | approved estimate contract price | |
| Current contract value | original + Σ approved CO price adjustments | |
| Committed cost | Σ approved commitments + Σ *billed portion* of closed commitments | Draft and cancelled commitments are excluded; quotes and awards are never counted |
| Billed cost = Recognized actual cost | Σ approved vendor bills | Draft and voided bills are excluded. In this app "billed" and "actual" are the same figure. |
| Paid amount | Σ non-reversed payments on approved bills | Never adds cost |
| Payable | actual − paid | |
| Remaining commitment | approved commitment − min(billed, commitment) | |
| Remaining forecast (ETC) | manual ETC if entered, else `max(current budget − actual, remaining commitment)` (derived) | |
| Forecast at completion (EAC) | manual: actual + ETC · default: `max(current budget, actual + remaining commitment)` | Prevents double counting: commitments contribute only their **unbilled** balance |
| Forecast variance | current budget − EAC | |
| Projected profit | current contract − EAC | `null` when no baseline |
| Projected margin | profit ÷ current contract | `null` when contract ≤ 0 |

### Reconciliation of the spec's test data (Phase 21) under these rules

Budget $20,000 · Award $18,500 → commitment $18,500 (after approval) · Bills $7,000 + $6,500 + $5,000 approved
- Committed $18,500 · Actual $18,500 (not $32,000) · Paid $13,500 · Payable $5,000 · Remaining commitment $0
- Default EAC = max($20,000, $18,500 + $0) = **$20,000**. The budget acts as the floor until the builder enters a manual ETC. A manual ETC of $0 gives EAC $18,500.
- With a +$2,500 commitment change, the target is revised commitment $21,000 with the homeowner contract unchanged. **Today this is not possible as a linked revision (gap 10a).**

### Gaps against the non-negotiable rules

| Rule | Status |
|---|---|
| Quote ≠ cost; award ≠ payment | Enforced (awards create only a *draft* commitment, never approved there) |
| Payment does not double count | Enforced and unit-tested |
| Customer CO vs. sub commitment change are separate | Customer side exists; sub side **missing** |
| No fabricated profitability | Partially met. Profit and margin are `null` without a baseline. However, the default EAC floors at budget, so a project with no commitments or bills shows *exactly budgeted* profit and looks healthy. The Phase 12 "Not assessed" state must account for this. |
| Preserve baseline & revision history | Enforced (approved records are immutable, CO history is kept) |

## Proposed architecture for later milestones (reuse-first)

| Milestone | Proposal | New schema? |
|---|---|---|
| 2 Quote workflow | Already built. Verify end-to-end with seeded test data in an isolated DB, fix the defects found, and refresh the stale "NOT YET APPLIED" headers. | No |
| 3 Work orders | Add `subcontract_work_orders` (1:1 with award via UNIQUE `award_id`, number per project, statuses draft → issued → acknowledged → active → completed → closed, acknowledgement type `none / portal_ack / e_signature`). Generate the document via the existing Document Template + e-signature system. **Commitment approval happens at work-order issuance**, reusing `project_commitments` (no second ledger). Optional `schedule_activity_id` reuses `schedule_activity_assignments`. | Yes, 1 table + RPCs |
| 3b Commitment changes | Add `project_commitment_changes` (append-only, signed `amount_cents`, approval state, idempotency key). Revised commitment = original + Σ approved changes. `summarizeJobCost` reads revised amounts. No link to customer `change_orders` unless explicitly chosen. | Yes, 1 table |
| 4 Bills | Add a server-side overbilling check: approving a bill whose cumulative approved billing exceeds the revised commitment requires an explicit acknowledgement that is recorded in audit. Add a `returned` state. Later, optional sub-portal bill submission into the existing `vendor_bills` as `draft`. | Additive columns |
| 5 Profitability | Add a "Financial health" state to `financial-summary.tsx`: *Not assessed* when the baseline is missing, or when the current budget is above zero but there are no commitments, no bills, and no manual forecasts. Show the reasons. | No |
| 6 AI | Add a manager-scoped read-only assistant tool that returns `summarizeJobCost` output and the bill list (pre-computed numbers only, with untrusted text delimited). Add deterministic Daily Priorities sources: bill due ≤ 7 days or overdue, draft bills, draft commitments from awards, commitment over budget, missing forecast. Use stable dedupe keys. | No |
| 7 Verification | Seed an isolated test project through RPCs; run three-actor browser checks; extend `supabase/tests/tenant_isolation` to cover cost and quote tables. | No |

## Blockers and decisions needed before Milestone 3

1. **Commitment authorization point.** This audit proposes that issuing the work order approves the commitment. The alternative is approving it when the subcontractor acknowledges.
2. **Legal acknowledgement.** Should work orders use the existing Dropbox Sign e-signature flow, or a recorded portal acknowledgement (labelled as limited)?
3. **Split awards** remain unsupported by design. Confirm this stays.
4. **Isolated test database.** Milestones 2 and 7 require seeding fictional data. The connected Supabase project appears to be the working environment (11 projects, 319 audit events), so seeding there would violate "do not modify production data". A separate Supabase branch or project is needed.
