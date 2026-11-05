import { formatDate, formatDateTime } from '@/lib/format'
import { TAX_LABELS, formatMoney, payableCents, type QuoteRevision } from '@/lib/subcontract-quotes'

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap text-sm text-foreground">{value}</dd>
    </div>
  )
}

export function QuoteDetails({ revision: r, currency }: { revision: QuoteRevision; currency: string | null }) {
  const payable = payableCents(r)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xl font-semibold tabular-nums text-foreground">{formatMoney(r.amount_cents, currency)}</p>
        <p className="text-xs text-muted-foreground">
          Revision {r.revision_number}
          {r.scope_version ? ` · scope v${r.scope_version}` : ''}
          {r.submitted_at ? ` · ${formatDateTime(r.submitted_at)}` : ''}
        </p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <Row label="Tax" value={r.tax_treatment ? TAX_LABELS[r.tax_treatment] : 'Not specified'} />
        {r.tax_treatment === 'excluded' ? (
          <Row label="Tax amount" value={r.tax_amount_cents === null ? 'Unknown' : formatMoney(r.tax_amount_cents, currency)} />
        ) : null}
        <Row label="Total payable" value={payable === null ? 'Not determinable yet' : formatMoney(payable, currency)} />
        <Row label="Valid until" value={r.valid_until ? formatDate(r.valid_until) : null} />
        <Row label="Duration" value={r.estimated_duration_days !== null ? `${r.estimated_duration_days} days` : null} />
        <Row label="Availability" value={r.availability} />
        <Row label="Tax details" value={r.tax_details} />
      </dl>
      <dl className="grid gap-3">
        <Row label="Inclusions" value={r.inclusions} />
        <Row label="Exclusions" value={r.exclusions} />
        <Row label="Allowances" value={r.allowances} />
        <Row label="Assumptions" value={r.assumptions} />
        {r.alternates?.length ? (
          <Row
            label="Alternates (not included in amount)"
            value={
              <ul className="flex flex-col gap-1">
                {r.alternates.map((a, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span>{a.description}</span>
                    <span className="tabular-nums">{formatMoney(a.amount_cents, currency)}</span>
                  </li>
                ))}
              </ul>
            }
          />
        ) : null}
      </dl>
    </div>
  )
}
