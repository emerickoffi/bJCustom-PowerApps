import { formatCentsExact, formatPercent, type EstimateTotals } from '@/lib/estimates'
import { cn } from '@/lib/utils'

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 text-sm', strong && 'font-semibold')}>
      <dt className={cn(muted ? 'text-muted-foreground' : 'text-foreground')}>{label}</dt>
      <dd className="tabular-nums text-foreground">{value}</dd>
    </div>
  )
}

export function EstimateSummary({ totals }: { totals: EstimateTotals }) {
  return (
    <section aria-labelledby="summary-heading" className="surface flex flex-col gap-5 p-5 md:p-6">
      <div className="flex flex-col gap-1 rounded-2xl bg-brand-deep p-5 text-white">
        <h2 id="summary-heading" className="text-xs font-medium uppercase tracking-wider text-white/65">
          Estimated construction cost
        </h2>
        <p className="font-serif text-4xl font-semibold tabular-nums tracking-tight">
          {formatCentsExact(totals.construction_total_cents)}
        </p>
        <p className="text-xs text-white/60">Excludes land. Calculated on the server.</p>
      </div>

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
