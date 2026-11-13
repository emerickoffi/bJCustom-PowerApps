# Trefort Daily Logs Redesign — Phase 0 Audit & Field Inventory

Milestone 1 of the Daily Logs redesign. **No application code or database was changed for this audit.**
Live findings come from read-only queries against Supabase project `koaaoatcxzhahoeiahxr` (the project the app's
`SUPABASE_URL` points to) on 2026-11-13.

Status key: **Verified Working** (executed and observed) · **Implemented — Unverified** (code and schema exist, not
exercised end-to-end) · **Partially Implemented** · **Missing** · **Blocked** (code exists but cannot run in the live
environment).

---

## 1. Headline findings

1. **Report Issue from a Daily Log is Blocked in the live project.** Migration
   `20261206000010_field_issues.sql` has not been applied: `public.report_field_issue`, `public.review_field_issue`,
   `public.issue_assignee_eligible` and the column `project_issues.source_daily_log_id` do not exist live. The drawer
   (`components/issues/report-issue-drawer.tsx`) and `app/actions/field-issues.ts` call `report_field_issue`, so every
   submission from the Daily Log page fails until that migration is reviewed and applied. Applying it needs your explicit
   authorization; it was not touched.
2. **Autosave is device-only today.** `useResilientSave` (`components/shared/resilient-save.tsx`) keeps entries on the
   device with a 600 ms debounce, flushes on `pagehide`/`visibilitychange`, and replays the server save idempotently
   (`save_daily_log_tracked` + `save_requests`). There is **no server-side autosave**. The spec's 3–5 s server autosave is
   Missing.
3. **`save_daily_log` replaces the whole crew list on every save** (`delete from daily_log_crews ... ; insert ...`). That
   is correct for a full form submit, but a partial autosave payload that omitted `p_crews` would delete every crew row.
   Phase 17 forbids that, so server autosave must always send the complete form (which the current form does). A new
   partial-patch RPC is not required and should not be introduced.
4. **Weather is manual-only by database constraint.** `daily_logs.weather_source` has
   `check (weather_source = 'manual')`. The existing provider (`app/api/weather/route.ts` → `lib/weather-data.ts`) only
   returns *today's* weather for a jobsite/device/place. Observed-historical vs forecast labelling (Phase 4) therefore
   needs (a) a reviewed migration widening `weather_source` and (b) a date-aware lookup in the existing provider. No new
   weather service is needed.
5. **The PDF has no builder branding or project address.** `app/print/daily-logs/[id]/page.tsx` renders "Daily log",
   date, project number/name and status only. No hard-coded BJ Custom Homes branding exists. The private
   `company-logos` bucket is now live, so company identity can be added without new storage.
6. **Live data at stake is minimal:** 1 organization (feature `daily_logs` enabled), **1 draft log, 0 crew rows,
   0 photos, 0 finalized logs**. Schema, guards and RPCs (`save_daily_log`, `save_daily_log_tracked`,
   `finalize_daily_log`, `daily_logs_before_write`, `daily_log_child_guard`, `daily_log_crew_company`) are all live.

---

## 2. Functional audit

| # | Area | Where | Status | Notes |
|---|------|-------|--------|-------|
| 1 | Daily Logs list + filters | `app/(staff)/daily-logs/page.tsx` (directory: search, project, status, pagination); `app/(staff)/projects/[id]/daily-logs/page.tsx` (from/to, status, delays, pagination) | Implemented — Unverified | Rows show date, project, status, delay flag and a work snippet. **Missing:** weather on directory, crew count, photo count, issue count, contextual Continue/PDF actions. |
| 2 | New Daily Log | `app/(staff)/daily-logs/new/page.tsx` (project picker) → `app/(staff)/projects/[id]/daily-logs/new/page.tsx` | Implemented — Unverified | One shared `DailyLogForm`. Wide stacked `FormSection`s; no progressive disclosure. |
| 3 | Edit Daily Log | `.../[logId]/edit/page.tsx` | Implemented — Unverified | Same `DailyLogForm` (good: Phase 3 "one form" already holds). Edit link hidden unless `canEditDailyLog` (draft and not archived). |
| 4 | Daily Log Details | `.../[logId]/page.tsx` + `components/daily-logs/daily-log-report.tsx` | Implemented — Unverified | Every block renders even when empty ("Not recorded." / "No crews recorded."). Separate large Finalize `Surface`. No summary strip, no linked-issues section. |
| 5 | Report Issue drawer | `components/issues/report-issue-action.tsx`, `report-issue-drawer.tsx` | **Blocked** (live) | Already has voice, title, description, photos, a collapsed "More details" (location, category, assignee, due date, priority), `request_id` idempotency, `sm:max-w-lg` width. Backend RPC missing live (finding 1). |
| 6 | Issue / punch relationships | `project_issues.source_daily_log_id`, `report_field_issue(p_source_daily_log …)` | **Blocked** (live) | Column and RPC exist only in the unapplied migration. |
| 7 | Save Draft | `saveDailyLogAction` → `save_daily_log_tracked` / `save_daily_log` | Implemented — Unverified | Atomic header + crews + activity links; optimistic `version`; one-log-per-project-per-day unique key; idempotent replay via `save_requests`. Redirects to details on success. |
| 8 | Autosave / draft recovery | `useResilientSave` + `SaveBanners` / `SaveStatus` | Partially Implemented | Device-side drafts, recovery banner, conflict + auth-expiry handling, tab lock. **No server autosave**, no `beforeunload` prompt. |
| 9 | Finalization | `finalizeDailyLogAction` → `finalize_daily_log`; `components/daily-logs/finalize-daily-log.tsx` | Implemented — Unverified | Confirm checkbox (server re-checks `confirm=yes`), row lock + version check, trigger requires `work_performed`, records `finalized_at/by`, finalized log and children immutable at the database. |
| 10 | PDF export | `app/print/daily-logs/[id]/page.tsx` | Partially Implemented | Browser print view reusing `DailyLogReport`; filename `{ProjectNo}_{Name}_Daily-Log_{date}`; staff-only via RLS. **Missing:** company identity/logo, project address, linked issues, finalized-by name; empty sections print as "Not recorded." |
| 11 | Statuses | `daily_logs.status in ('draft','finalized')` | Implemented — Unverified | No "Submitted" state exists. Do not add one. |
| 12 | Weather | form fields + `weather_source` | Partially Implemented | Manual entry only (finding 4). Provider exists for today only. |
| 13 | Crew & subcontractors | `daily_log_crews` (+ `subcontractor_company_id`, `company_name` snapshot) | Implemented — Unverified | Assigned-to-project companies listed first; inactive saved company preserved. Wide 6-column grid. **Missing:** Copy crew from previous log. |
| 14 | Work performed / progress | `work_performed` (8,000), `progress_notes`, `work_planned_next`, linked schedule activities | Implemented — Unverified | Fixed-height textareas. |
| 15 | Materials & equipment | `materials_delivered`, `equipment_used` | Implemented — Unverified | |
| 16 | Deliveries & delays | `delivery_notes`, `delay_description/reason/impact`, `corrective_actions`, generated `has_delays` | Implemented — Unverified | Reason/impact require a description (zod `superRefine`). |
| 17 | Safety | `safety_observations` | Implemented — Unverified | No separate incident or hazard columns exist. |
| 18 | Photos / video / Storage | `components/daily-logs/daily-log-photos.tsx`, `lib/photo-upload.ts`, bucket `project-media` path `daily-logs/{log}/{uuid}-{name}` | Implemented — Unverified | Camera capture (`capture="environment"`), upload, captions, retry list, 30-photo cap, 15 MB, orphan cleanup when registration fails, duplicate-safe registration. **Photos require a saved log** (form offers "Save and add photos"). **Video: Missing**, since the column check allows images only. |
| 19 | Voice | `app/api/projects/[id]/voice-punch/transcribe/route.ts` (AI SDK `transcribe`, `openai/gpt-4o-mini-transcribe`), `lib/voice-punch.ts` (90 s, 4 MB, 20/user/h, 400/org/day) | Implemented for issues only | Daily Log fields have no microphone. Transcription step is reusable; the issue-structuring step (`voice-punch/draft`) is not relevant to logs. Raw audio is not stored. |
| 20 | AI integrations | `lib/ai/construction-briefing.ts`, `assistant-retrieval.ts` read daily logs | Implemented — Unverified | Read-only consumers; redesign must keep column names stable. |
| 21 | Role permissions | `requireDailyLogProject`, `canEditDailyLog` | Implemented — Unverified | Staff with internal project access only. |
| 22 | RLS | `daily_logs_*`, child `_write`/`_select`, restrictive `_feature_gate` policies; storage via `can_upload_media_path` / `can_view_media_path` `daily-logs` branch | Implemented — Unverified (live policies present) | Homeowners have no policy and cannot see drafts or finalized logs. No delete policy on logs. |
| 23 | Tests / constraints | `lib/daily-logs.test.ts` (12 tests: parsing, filters, dates, totals, paths) | Implemented | No UI or end-to-end tests. Strong DB constraints (lengths, ranges, unique day, finalized check). |

---

## 3. Field inventory → proposed position

Every column is kept. Nothing is removed or renamed.

| Database field | Current UI section | Redesigned position | Disclosure |
|---|---|---|---|
| `project_id` | Route / project picker | Daily Overview header (read-only once created) | Always visible |
| `log_date` | Date and weather | Daily Overview | Always visible |
| `status` | Details eyebrow | Daily Overview + action bar | Always visible |
| `weather_conditions` | Date and weather | Daily Overview → Weather | Always visible |
| `temperature_f` | Date and weather | Daily Overview → Weather | Always visible |
| `weather_impact` | Date and weather | Daily Overview → Weather (one line) | Always visible |
| `weather_source` | Not shown (fixed `manual`) | Weather source label ("Entered manually" / later "Observed" / "Forecast") | Display only |
| `site_conditions` | Date and weather | Additional Details → Safety & Site Conditions | Collapsible |
| `work_performed` | Work | **Work Completed Today** (primary, auto-grow, mic) | Always visible; required to finalize |
| `progress_notes` | Work | Additional Details → Progress & Additional Notes (mic) | Collapsible |
| `work_planned_next` | Work | Additional Details → Progress & Additional Notes | Collapsible |
| `daily_log_activities` | Work → checklist | Additional Details → Progress & Additional Notes | Collapsible |
| `daily_log_crews.*` (`subcontractor_company_id`, `trade`, `crew_size`, `hours_worked`, `notes`, `sort_order`) | Crews on site (wide grid) | **Crew & Subcontractors** compact rows + Add Crew + Copy from previous log | Always visible |
| `daily_log_photos.*` | Separate section on details page | **Site Photos** near top of form (after first save) | Always visible |
| `materials_delivered` | Materials and equipment | Additional Details → Materials & Equipment | Collapsible |
| `equipment_used` | Materials and equipment | Additional Details → Materials & Equipment | Collapsible |
| `delivery_notes` | Materials and equipment | Additional Details → Deliveries & Delays | Collapsible |
| `delay_description` / `delay_reason` / `delay_impact` | Delays and safety | Additional Details → Deliveries & Delays | Collapsible; auto-opens on error |
| `corrective_actions` | Delays and safety | Additional Details → Deliveries & Delays | Collapsible |
| `safety_observations` | Delays and safety | Additional Details → Safety & Site Conditions (mic) | Collapsible; marked "recorded" when filled |
| `has_delays` (generated) | List flag | List + Details summary | Display only |
| `version`, `finalized_at`, `finalized_by`, `author_id`, `created_*`, `updated_*` | Hidden / details note | Hidden fields; finalization line on details and PDF | Display only |

The spec's Materials "used", Equipment "usage", Incidents and Hazards have **no columns**. Per Phase 0 they map to the
existing free-text fields above. No columns are proposed for them.

---

## 4. Risks the redesign must respect

- **Crew replace-on-save** (finding 3): autosave must submit the complete form, never a partial body.
- **One log per project per day** and the "today + 1" ceiling on the date in the org time zone (`org_today`).
- **Finalized immutability** is enforced by triggers. The UI must not offer edits, and server autosave must stop
  once finalized.
- **Photos only attach to saved logs** (storage path embeds the log id). "Site Photos near the top" on a brand-new log
  must save the draft first, as the existing "Save and add photos" button already does.
- **Device draft vs server draft:** server autosave must reuse `useResilientSave`'s request id and version so a replay
  cannot create a second log or overwrite newer edits (`save_requests` already de-duplicates).

---

## 5. Decisions required before later milestones

| Milestone | Needs | Why |
|---|---|---|
| 6 — Report Issue | Authorization to apply `20261206000010_field_issues.sql` | Drawer backend is missing live (finding 1). |
| 4 — Weather | Authorization for a migration widening `weather_source` to e.g. `('manual','observed','forecast')` | Today's check constraint rejects any non-manual source. |
| 3 — Autosave | Confirmation that a server save every ~4 s of idle time is acceptable for a draft (each save bumps `version` and writes an audit event) | Audit volume and version churn. |
| 8 — E2E | An isolated Supabase branch or test project | The spec forbids seeding fictional records into the working project. |

---

## 6. Proposed PR sequence

1. **This PR:** audit only.
2. Create/Edit UX: compact layout, Daily Overview, auto-grow Work Completed, compact crew rows, Additional Details
   with completion indicators and auto-expand on error, sticky action bar with safe-area inset, `beforeunload` guard.
   No schema change.
3. Server autosave on top of `useResilientSave`, sending the full form.
4. Copy crew from previous log, photos-near-top flow, voice-to-text on narrative fields (reusing the transcribe route).
   Weather suggestion follows if the migration is approved.
5. Details page: summary strip, hide empty sections, compact Finalize, linked issues.
6. Report Issue drawer refinements (after its migration is applied).
7. PDF branding, address, issues, finalization line, no empty sections.
8. End-to-end and responsive verification in an isolated environment, plus
   `docs/TREFORT_DAILY_LOGS_COMPLETE_REDESIGN.md`.
