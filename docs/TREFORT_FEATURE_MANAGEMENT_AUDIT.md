# Feature Management Audit

Scope: Settings → Features. No database writes and no migrations were applied. Live checks were read-only: `HEAD` requests returning no rows, plus the immutable `public.feature_registry()` function.

## 1. Actual implementation status

Evidence: code, migrations, the live schema, and server-side gating.

| Feature | Status | Evidence |
|---|---|---|
| Client records, additional contacts, communication log, contact permissions | Core (always on) | Live tables; RLS-enforced |
| Schedule, Estimates, Walkthroughs, Walkthrough reports, Punch list, Warranty, Homeowner portal, Invoices, Daily logs | Available | Live tables, routes, `requireFeature` gating, existing unit tests |
| Documents | Available | `project_documents` / `project_document_versions` live (200) |
| Change orders | Available | `change_orders` live (200), in live registry |
| Subcontractors | Available | `subcontractor_companies` live (200) |
| **Selections** | **Available, governed by Estimates** (was "Coming later") | 4 migrations; `selections`, `selection_options`, `selection_categories` live (200); routes and project tab gated by `features.estimates` + financial/internal access |
| Electronic signatures | Implemented, unverified end-to-end | Dropbox Sign integration present; `DROPBOX_SIGN_API_KEY` configured; `signature_requests` live. No test signature was sent. |
| Trefort AI Assistant | Implemented, unverified live | Gated by `features.ai_assistant` and provider configuration |
| **AI estimate drafting** | **Available with AI Assistant** (was "AI estimate review — Coming later") | `lib/ai/estimate-draft*.ts`, used in `/api/assistant` |
| **Voice punch list** | **Available with AI Assistant** (newly listed) | `/api/projects/[id]/voice-punch/*`; server checks session, non-client role, `ai_assistant`, provider, and project tenancy |
| **AI quote comparison** | **Available with AI Assistant + Subcontractors** (newly listed) | `lib/ai/quote-analysis.ts`; page uses `requireFeature('subcontractors')` + `ai_assistant` |
| AI schedule advisor | Partial (was "Coming later") | Assistant answers schedule questions; project health flags schedule risk. No dedicated advisor. |
| AI warranty assistance | Partial (was "Coming later") | Assistant reads warranty records. No claim drafting. |
| **Client updates** | **Setup required** | `client_updates`, `client_update_photos` return **404** live. Migration not applied. |
| **Questions (RFIs)** | **Setup required** | `project_rfis`, `project_rfi_comments`, `project_rfi_files` return **404** live; `rfis` is absent from live `feature_registry()`. Migration not applied. |
| Consultations, Project photos, Online payments, QuickBooks, Advanced/Schedule/Warranty reports, Data exports | Planned | No schema or routes |

## 2. Availability corrections

- Selections: "Coming later" → implemented. It's shown as included with Estimates and follows that switch. It has no switch of its own because the database registry has no `selections` key and enforcement is on `estimates`.
- AI sub-features: replaced the inaccurate "Coming later" labels with shipped capabilities (estimate drafting, voice punch, quote comparison) and two Partial entries.
- QuickBooks: "Setup required" → Planned. No connector code exists.
- The status vocabulary is now Core / Partial / Setup required / Planned. Plain available features show only their switch.
- `resolveFeatures` gives included entries the state of their parent and never turns on a planned or display-only entry from a stored preference.

## 3. Dependency fixes

- The database guard (`set_organization_feature`) already enforces both directions. No change was needed.
- Removed the "Locked by dependency" badge. When Electronic signatures is on, Documents now shows the neutral line "Used by Electronic signatures." Its switch stays usable.
- Turning off a feature that other features use opens an explicit confirmation listing them. On confirmation it turns off dependents first, deepest first, so the database guard is never violated. Nothing is disabled without that confirmation.
- Enabling with a missing prerequisite keeps the switch disabled and shows "Needs Documents. Turn it on first."
- **Security fix:** `setFeatureAction` previously checked only Subcontractors' migration server-side. It now also refuses to enable Client updates, Questions (RFIs), and Change orders when their tables are missing. Before this, the UI lock was the only guard for those three. It also rejects any display-only key.

## 4. UI refinements

- Compact rows (`py-3`, `text-sm` labels) with one message per row, chosen by priority: setup → missing prerequisite → included-with → used-by.
- Teal for switches and links, orange (`champagne`) for setup warnings, blue for Partial, muted for Planned.
- The "Requires …" line is gone because it duplicated the dependency message. Descriptions are shortened to one sentence. The settings layout is unchanged.

## 5. Migration and integration blockers

- **Client updates:** apply the client updates migration (tables `client_updates`, `client_update_photos`).
- **Questions (RFIs):** apply the RFI migration (tables and registration of `rfis` in `feature_registry()`).
- **Electronic signatures:** the API key is present. End-to-end signing was not exercised, per instruction not to send test signatures.
- None were applied automatically.

## 6. Tests completed (executed)

- `lib/feature-dependencies.test.ts`: **12/12 pass**. Covers: switchable keys ⊆ the live DB registry; Selections status and Estimates gating; AI entries' state and prerequisites; planned features can't be enabled; preference persistence and defaults; the Documents ↔ Electronic signatures dependency in both directions; transitive ordering of dependents; setup locks.
- Full suite `npm test`: **580/580 pass**.
- `tsc --noEmit`: clean.

## 7. Remaining unverified

- **Role-based visibility** was reviewed in code only: `navForRole` filters by role and feature; the project nav gates Selections on financial and internal access; voice punch rejects the client role. It was not exercised per role (Admin, PM, Staff, Subcontractor, Homeowner) in a browser because the sandbox has no seeded sessions.
- **Mobile layout and browser enable/disable:** not verified in a browser. `/settings/features` redirects to login without an admin session.
- **Live AI calls and Dropbox Sign signing:** not executed.
