# Trefort Questions (RFIs) — Implementation Report

Status: **Audit and migration verification complete. Migration NOT applied — awaiting explicit authorization.**
Date: 2026-11-13

## 1. Why Feature Management says "Setup required"

The switch is locked by `app/(staff)/settings/features/page.tsx`, which treats RFIs as unavailable when
`project_rfis` is missing **or** `feature_registry()` has no `rfis` row. Both are true in the connected database.

Read-only probe of the working Supabase database (no writes):

| Object (from `20261211000010_project_rfis.sql`) | Live state |
| --- | --- |
| 6 tables (`project_rfis`, `_counters`, `_responses`, `_comments`, `_events`, `_attachments`) | Missing (PGRST205) |
| 37 functions (`rfi_*`, `my_assigned_rfis`, guards) | Missing (PGRST202) |
| Storage bucket `project-rfis` + 3 `storage.objects` policies | Missing |
| `rfis` row in `feature_registry()` | Missing (18 keys live, ending at `change_orders`) |

Conclusion: the migration was **skipped entirely**, not partially applied. Later migrations (through
`20261231000021`) are live.

## 2. Is it safe to apply out of date order?

Yes, based on these checks:

- **No overwrites of newer work.** The only object it shares with any other migration is `feature_registry()`.
  Its version contains all 18 live keys unchanged and adds `('rfis', false, [])`. No later migration redefines it.
- **All dependencies exist live:** 15 tables (projects, documents, document versions, notifications, memberships,
  business people/companies, subcontractor companies, portal accounts, project assignments, …) and 6 helpers
  (`can_view_document_version`, `can_view_project_internal`, `is_feature_enabled`, `is_org_manager`,
  `is_org_staff`, `is_project_homeowner`), each called with its real signature.
- **Additive only.** It creates new objects and writes no existing rows. `rfis` defaults to **off**, so no
  company's preferences change and nothing appears until an admin turns it on.
- **Later migrations already expect it:** `20261220000010_email_notifications` and `20261221000010_portal_approvals`
  map notification kind `rfi` → email category `rfi_activity`.

## 3. Existing functionality (already built and reused)

| Requirement | Where | Status |
| --- | --- | --- |
| + Ask Question drawer (essentials + collapsible details: activity, document, location, priority, files) | `components/rfis/ask-question-drawer.tsx` | Built |
| Lifecycle Draft → Open → Answered → Closed, reopen with reason | `rfi_transition`, `rfi-detail.tsx` | Built |
| Per-project numbering (RFI-001) assigned on send, concurrency-safe | `project_rfi_counters`, `rfi_send` | Built |
| Append-only answers, comments, history; original question preserved | triggers `project_rfi_append_only`, `project_rfis_guard` | Built |
| Compact list: search, status, My / All, pagination | `app/(staff)/projects/[id]/rfis/page.tsx`, `rfi-workspace.tsx` | Built |
| Detail view with one clear next action | `components/rfis/rfi-detail.tsx` | Built |
| Project access via the More menu, no new sidebar item | `lib/project-nav.ts` | Built |
| Linked schedule activity / document (references only) | `rfi_ref`, `/api/rfis/options` | Built |
| Idempotent writes (request ids), row-version conflict checks | all `rfi_*` RPCs | Built |
| In-app notifications using existing `notifications` + dedupe keys | `rfi_notify`, `rfi_resolve_notices` | Built |
| Email delivery via existing category `rfi_activity` | email migrations | Built |
| Daily Priorities and action items ("Respond", overdue, review) | `lib/daily-priorities.ts`, `lib/action-items.ts`, `lib/attention-data.ts` | Built |
| Feature Management entry, lock until set up, records kept when off | `lib/feature-registry.ts` | Built |
| SQL workflow + permission tests | `supabase/tests/project_rfis/*` | Written, not yet run |

## 4. Permissions

- Tables have **SELECT policies only**; every write goes through a `security definer` function that re-checks
  caller, organization, project, feature, status, and row version.
- Managers create, assign, review, close, and reopen. Staff ask and take part where they have project access.
- Subcontractors can be responders only when they have a portal account **and** an assignment on that project
  (`rfi_user_eligible`). They see only questions assigned to them.
- Homeowners have no access. The staff API also returns 404 for the `client` role.
- Turning the feature off hides every row via `is_feature_enabled`. Nothing is deleted.

## 5. Financial and schedule safety

The migration writes no table except its own and `public.notifications`. Answering or closing a question never
touches estimates, change orders, budgets, commitments, contract price, or the schedule.

## 6. Gaps found

1. **No subcontractor portal screen for RFIs.** `my_assigned_rfis()` exists in SQL but nothing in `app/sub` calls
   it. Once the database is live, an assigned subcontractor gets notified but has no portal page to answer from.
   `answerRfiAction` and `commentRfiAction` are already written to accept non-staff callers.
2. **No AI Assistant tools for RFIs.** `lib/ai/*` has no RFI context or summarise/rewrite helpers. Daily
   Priorities does surface RFIs.
3. **No explicit "blocks activity" relationship.** A question can reference an activity, but nothing records that
   the question *blocks* it. Daily Priorities should not claim blocking until that is stored.
4. **No "start a change order from this question" shortcut.** That would be a separate, explicitly authorized
   action and is not built.

## 7. Tests performed

- `node --test lib/rfis.test.ts lib/feature-dependencies.test.ts lib/project-preview.test.ts`: 41 / 41 pass.
- `tsc --noEmit`: clean.
- Read-only live schema probes (section 1–2).
- **Blocked:** `supabase/tests/project_rfis/workflow.sql` (create, send, answer, clarify, close, reopen,
  subcontractor/homeowner/tenant isolation). It needs an isolated database with the migration applied. Per the
  brief, it was not run against the working database and no test records were seeded.
- **Blocked:** end-to-end browser checks. The pages can't load data until the tables exist.

## 8. Production readiness

Not ready to enable yet. Steps:

1. Get authorization, then apply `20261211000010_project_rfis.sql` (ideally to a branch or staging database first)
   and run `supabase/tests/project_rfis/workflow.sql` there.
2. Apply it to the working database. The Feature Management switch unlocks automatically and stays **off**.
3. Build the subcontractor portal answer screen (gap 1) before enabling for companies that use subcontractor
   responders.
4. Optional follow-ups: AI helpers (gap 2), the blocking relationship (gap 3), the change-order shortcut (gap 4).
