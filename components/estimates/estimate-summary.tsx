import { formatCentsExact, formatPercent, type EstimateTotals } from '@/lib/estimates'
import { estimateFinancials, formatTenths } from '@/lib/estimate-financials'
import { cn } from '@/lib/utils'

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums text-foreground">{value}</dd>
      {hint && <dd className="text-[11px] leading-tight text-muted-foreground">{hint}</dd>}
    </div>
  )
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 text-sm', strong && 'font-semibold')}>
      <dt className={cn(muted ? 'text-muted-foreground' : 'text-foreground')}>{label}</dt>
      <dd className="tabular-nums text-foreground">{value}</dd>
    </div>
  )
}

export function EstimateSummary({
  totals,
  note = 'Excludes land. Calculated on the server.',
  headingId = 'summary-heading',
  label = 'Client price',
  className,
}: {
  totals: EstimateTotals
  note?: string
  headingId?: string
  label?: string
  className?: string
}) {
  const f = estimateFinancials(totals)
  return (
    <section aria-labelledby={headingId} className={cn('surface flex flex-col gap-5 p-5 md:p-6', className)}>
      <div className="flex flex-col gap-1 rounded-2xl bg-brand-deep p-5 text-white">
        <h2 id={headingId} className="text-xs font-medium text-white/65">
          {label}
        </h2>
        <p className="type-financial">
          {formatCentsExact(totals.construction_total_cents)}
        </p>
        <p className="text-xs text-white/60">{note}</p>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border p-4">
        <Metric label="Builder cost" value={formatCentsExact(f.builderCostCents)} hint="Direct costs plus allowances" />
        <Metric label="Profit (markup)" value={formatCentsExact(f.profitCents)} />
        <Metric
          label="Markup on cost"
          value={formatTenths(f.markupTenths)}
          hint="Profit ÷ builder cost"
        />
        <Metric label="Gross margin" value={formatTenths(f.marginTenths)} hint="Profit ÷ client price" />
      </dl>

      <dl className="flex flex-col gap-2.5">
        <Row label="Materials" value={formatCentsExact(totals.material_cents)} muted />
        <Row label="Labor" value={formatCentsExact(totals.labor_cents)} muted />
        <Row label="Other direct costs" value={formatCentsExact(totals.other_cents)} muted />
        <div className="border-t pt-2.5">
          <Row label="Direct cost subtotal" value={formatCentsExact(totals.direct_cost_cents)} strong />
        </div>
        <Row label={`Markup (${formatPercent(totals.markup_percent)})`} value={formatCentsExact(totals.markup_cents)} muted />
        <Row label="Allowances" value={formatCentsExact(totals.allowance_cents)} muted />
        <Row
          label={`Contingency (${formatPercent(totals.contingency_percent)})`}
          value={formatCentsExact(totals.contingency_cents)}
          muted
        />
        <div className="border-t pt-2.5">
          <Row label="Construction total" value={formatCentsExact(totals.construction_total_cents)} strong />
        </div>
      </dl>

      <dl className="flex flex-col gap-2.5 rounded-xl bg-sage/50 p-4">
        <Row
          label="Land cost (separate)"
          value={totals.land_cost_cents === null ? 'Not included' : formatCentsExact(totals.land_cost_cents)}
          muted
        />
        <Row label="Total including land" value={formatCentsExact(totals.total_with_land_cents)} strong />
      </dl>
    </section>
  )
}
