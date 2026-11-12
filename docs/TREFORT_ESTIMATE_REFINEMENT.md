# Trefort Estimate Refinement

## What changed

- `lib/estimate-financials.ts` (new): derives builder cost, profit, contingency, client price, markup on cost and gross margin from the existing totals. Display only.
- Summary panel: new metric block with Builder cost, Profit (markup), Markup on cost and Gross margin. The headline is now labeled "Client price".
- Sticky total bar: "Client price" label. Builder cost and profit appear inline on screens `sm` and wider.
- Compact total bar (pricing/review tabs): now labeled "Client price".
- Items view toggle: "Spreadsheet" is renamed "Edit in grid" (or "Grid" when read-only), and the chosen view is remembered per browser.

## What was preserved

- Every calculation path (`computeTotals`), server actions, conflict detection, retry safety, RLS, permissions, AI estimate structures, and existing keyboard and paste behavior in the grid.

## Database changes

None.

## Financial calculation rules

All amounts are integer cents. Percentages are computed in tenths of a percent using integer rounding.

- Builder cost = direct costs + allowances
- Profit = markup amount
- Client price = construction total (direct + allowances + markup + contingency; land is shown separately)
- Markup on cost = profit ÷ builder cost
- Gross margin = profit ÷ client price
- A zero denominator shows "—" instead of a percentage.

## Tests executed

- `npx tsc --noEmit`: clean.
- `npm test`: 515 passing, including 4 new tests in `lib/estimate-financials.test.ts` (markup vs margin denominators, allowances without markup, contingency excluded from profit, empty estimate).

## Known limitations

- The view preference is stored per browser (localStorage). It is a UI preference only and does not follow the user across devices.
- The model has no sales tax, so client price is pre-tax.
- Not checked in a browser in this pass.

## Out of scope

- New tables, per-line margin targets, and changes to how markup applies to allowances.
