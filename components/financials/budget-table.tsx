import { Fragment } from 'react'
import { formatMoney } from '@/lib/financials'
import type { JobCostSummary } from '@/lib/job-costing'
import { cn } from '@/lib/utils'

const money = (v: number | null, signed = false) => (v === null ? '—' : formatMoney(v, { signed }))

export function BudgetTable({ summary }: { summary: JobCostSummary }) {
  const tracking = summary.costTrackingAvailable
  const cols = tracking ? 8 : 3
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[720px] text-sm">
        <caption className="sr-only">Budget versus actual by cost code</caption>
        <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium">Cost code</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Original</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Revised</th>
            {tracking && (
              <>
                <th scope="col" className="px-3 py-2 text-right font-medium">Committed</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Actual</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Paid</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Forecast</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Variance</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {summary.groups.length === 0 ? (
            <tr>
              <td colSpan={cols} className="px-3 py-6 text-center text-muted-foreground">
                No budget lines yet.
              </td>
            </tr>
          ) : (
            summary.groups.map((g) => (
              <Fragment key={g.code}>
                <tr className="border-b border-border bg-muted/20 font-medium">
                  <th scope="row" className="px-3 py-2 text-left">
                    <span className="tabular-nums text-muted-foreground">{g.code}</span> {g.label}
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">{money(g.originalCents)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(g.revisedCents)}</td>
                  {tracking && (
                    <>
                      <td className="px-3 py-2 text-right tabular-nums">{money(g.committedCents)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(g.actualCents)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(g.paidCents)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(g.forecastCents)}</td>
                      <td className={cn('px-3 py-2 text-right tabular-nums', (g.varianceCents ?? 0) < 0 && 'text-destructive')}>{money(g.varianceCents, true)}</td>
                    </>
                  )}
                </tr>
                {g.categories.map((c) => (
                  <tr key={c.category} className="border-b border-border/60 last:border-0">
                    <th scope="row" className="py-2 pl-8 pr-3 text-left font-normal text-muted-foreground">
                      {c.category}
                      {c.manualEtc && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px]">Manual ETC</span>}
                    </th>
                    <td className="px-3 py-2 text-right tabular-nums">{money(c.originalCents)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(c.revisedCents)}</td>
                    {tracking && (
                      <>
                        <td className="px-3 py-2 text-right tabular-nums">{money(c.committedCents)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(c.actualCents)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(c.paidCents)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(c.forecastCents)}</td>
                        <td className={cn('px-3 py-2 text-right tabular-nums', (c.varianceCents ?? 0) < 0 && 'text-destructive')}>{money(c.varianceCents, true)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </Fragment>
            ))
          )}
        </tbody>
        {summary.groups.length > 0 && (
          <tfoot className="border-t border-border font-semibold">
            <tr>
              <th scope="row" className="px-3 py-2 text-left">Total</th>
              <td className="px-3 py-2 text-right tabular-nums">{money(summary.originalCostCents)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(summary.revisedCostCents)}</td>
              {tracking && (
                <>
                  <td className="px-3 py-2 text-right tabular-nums">{money(summary.committedCents)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(summary.actualCents)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(summary.paidToVendorsCents)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(summary.forecastCents)}</td>
                  <td className={cn('px-3 py-2 text-right tabular-nums', (summary.forecastVarianceCents ?? 0) < 0 && 'text-destructive')}>{money(summary.forecastVarianceCents, true)}</td>
                </>
              )}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
