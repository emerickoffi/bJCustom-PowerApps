# Trefort Estimate UX Audit

## What already exists (reused, not rebuilt)

| Area | Implementation | Status |
| --- | --- | --- |
| Workspace & tabs | `components/estimates/estimate-workspace.tsx` | Items / pricing / review / history tabs with a compact total bar |
| Line items | `components/estimates/estimate-sheet.tsx`, `estimate-line-item-list.tsx` | List view and an editable grid with keyboard navigation, Esc to revert, paste, undo, and duplicate/delete |
| Categories | `ESTIMATE_CATEGORIES` in `lib/estimates.ts` | Collapsible groups with per-category subtotals |
| Drawer entry | Line-item drawer in `estimate-sheet.tsx` | Includes "Save & add another" |
| Saving | Server actions with version checks | Retry-safe; detects conflicting edits |
| Calculation | `computeTotals` in `lib/estimate-sheet.ts` | Integer cents; the only source of totals |
| Summary | `estimate-summary.tsx`, `estimate-total-toolbar.tsx` | Sticky total; cost breakdown by type |
| Security | Supabase RLS on estimate tables, org-scoped queries | Unchanged |
| Tests | `lib/estimate-sheet.test.ts` and related | Cover totals, markup, contingency, allowances |

## Gaps found

1. Builder cost, profit, markup % and gross margin were never shown, so a builder couldn't see what they make on a job.
2. "Estimate total" / "Estimated construction cost" didn't say whether it was the client's price or the builder's cost.
3. The grid view was hard to find and wasn't remembered. Every visit opened the read-only list, which made spreadsheet-style editing feel missing.

## Decisions

- No new tables, columns or calculation services. The new figures are derived from the existing `EstimateTotals`.
- Contingency is a reserve, not profit, so it is reported separately and is not included in margin.
- Allowances count as builder cost but carry no markup. Effective markup on cost can therefore read lower than the configured markup percentage.
