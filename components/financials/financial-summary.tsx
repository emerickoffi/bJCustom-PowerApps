import { AlertTriangle, Info } from 'lucide-react'
import { formatMoney } from '@/lib/financials'
import { formatBasisPoints, type JobCostSummary } from '@/lib/job-costing'
import { cn } from '@/lib/utils'

type Metric = { label: string; value: number | null; hint: string; missing: string; tone?: 'negative-bad' }

function MetricCard({ metric }: { metric: Metric }) {
  const negative = metric.tone === 'negative-bad' && metric.value !== null && metric.value < 0
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
      <dt className="text-xs font-medium text-muted-foreground">{metric.label}</dt>
      <dd className={cn('text-xl font-semibold tabular-nums text-foreground', negative && 'text-destructive')}>
        {metric.value === null ? <span className="text-sm font-medium text-muted-foreground">{metric.missing}</span> : formatMoney(metric.value, { signed: metric.tone === 'negative-bad' })}
      </dd>
      <p className="text-xs leading-relaxed text-muted-foreground">{metric.hint}</p>
    </div>
  )
}

export function FinancialSummary({ summary, showProfit }: { summary: JobCostSummary; showProfit: boolean }) {
  const noBudget = 'Not established'
  const notSetUp = 'Not set up'
  const insufficient = 'Insufficient data'
  const tracking = summary.costTrackingAvailable

  const cost: Metric[] = [
    { label: 'Original cost budget', value: summary.originalCostCents, missing: noBudget, hint: 'Approved estimate direct cost, allowances and contingency. Markup excluded.' },
    { label: 'Revised cost budget', value: summary.revisedCostCents, missing: noBudget, hint: 'Original budget plus approved change-order costs.' },
    { label: 'Committed', value: summary.committedCents, missing: notSetUp, hint: 'Approved subcontracts and purchase commitments. Not actual cost.' },
    { label: 'Actual cost', value: summary.actualCents, missing: notSetUp, hint: 'Approved vendor bills only.' },
    { label: 'Paid to vendors', value: summary.paidToVendorsCents, missing: notSetUp, hint: 'Recorded vendor payments, net of reversals.' },
    { label: 'Vendor payables', value: summary.payableCents, missing: notSetUp, hint: 'Approved bills not yet paid.' },
    { label: 'Estimate to complete', value: summary.etcCents, missing: tracking ? insufficient : notSetUp, hint: 'Forecast final cost minus actual cost.' },
    { label: 'Forecast final cost', value: summary.forecastCents, missing: tracking ? insufficient : notSetUp, hint: 'Per category: manual estimate to complete if recorded, otherwise the greater of revised budget or actual plus remaining commitments.' },
    { label: 'Forecast variance', value: summary.forecastVarianceCents, missing: tracking ? insufficient : notSetUp, tone: 'negative-bad', hint: 'Revised budget minus forecast. Negative means projected overrun.' },
  ]

  const revenue: Metric[] = [
    { label: 'Contract revenue', value: summary.contractRevenueCents, missing: noBudget, hint: 'Approved estimate construction total plus approved change-order prices.' },
    { label: 'Billed to homeowner', value: summary.billedCents, missing: '', hint: 'Issued invoices. Drafts and voided invoices excluded.' },
    { label: 'Collected', value: summary.collectedCents, missing: '', hint: 'Payments recorded on invoices.' },
    { label: 'Homeowner balance', value: summary.homeownerOutstandingCents, missing: '', hint: 'Billed but not yet collected.' },
  ]

  return (
    <div className="flex flex-col gap-6">
      {summary.alerts.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Financial alerts">
          {summary.alerts.map((a) => (
            <li
              key={a.id}
              className={cn(
                'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm',
                a.tone === 'warning' ? 'border-destructive/30 bg-destructive/5 text-foreground' : 'border-border bg-muted/50 text-muted-foreground',
              )}
            >
              {a.tone === 'warning' ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" /> : <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
              <span>{a.message}</span>
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="cost-heading" className="flex flex-col gap-3">
        <h2 id="cost-heading" className="text-sm font-semibold text-foreground">Cost</h2>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cost.map((m) => <MetricCard key={m.label} metric={m} />)}
        </dl>
      </section>

      <section aria-labelledby="revenue-heading" className="flex flex-col gap-3">
        <h2 id="revenue-heading" className="text-sm font-semibold text-foreground">Revenue and billing</h2>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {revenue.map((m) => <MetricCard key={m.label} metric={m} />)}
        </dl>
      </section>

      {showProfit && (
        <section aria-labelledby="profit-heading" className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 id="profit-heading" className="text-sm font-semibold text-foreground">Forecast profitability</h2>
            <p className="text-xs text-muted-foreground">Visible to administrators only. Never shown in the homeowner portal.</p>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            <MetricCard
              metric={{
                label: 'Forecast gross profit',
                value: summary.grossProfitCents,
                missing: summary.budgetEstablished && !tracking ? notSetUp : insufficient,
                tone: 'negative-bad',
                hint: 'Contract revenue minus forecast final cost.',
              }}
            />
            <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
              <dt className="text-xs font-medium text-muted-foreground">Forecast gross margin</dt>
              <dd className="text-xl font-semibold tabular-nums text-foreground">
                {summary.grossMarginBasisPoints === null ? <span className="text-sm font-medium text-muted-foreground">{insufficient}</span> : formatBasisPoints(summary.grossMarginBasisPoints)}
              </dd>
              <p className="text-xs leading-relaxed text-muted-foreground">Forecast gross profit as a share of contract revenue.</p>
            </div>
          </dl>
        </section>
      )}
    </div>
  )
}
