import { categoryLabel } from '@/lib/email/categories'
import { RetryEmailButton } from './retry-email-button'

export type EmailDeliveryOverview = {
  counts: Record<string, number>
  oldest_queued_at: string | null
  recent_failures: {
    id: number
    category: string
    recipient_email: string
    last_error: string | null
    attempts: number
    updated_at: string
  }[]
}

const STATUS_LABELS: [string, string][] = [
  ['sent', 'Sent'],
  ['queued', 'Waiting'],
  ['skipped', 'Skipped'],
  ['failed', 'Failed'],
]

function maskEmail(email: string) {
  const [local, domain] = email.split('@')
  if (!domain) return email
  return `${local.slice(0, 2)}${'•'.repeat(Math.max(1, local.length - 2))}@${domain}`
}

export function EmailDeliveryCard({
  overview,
  ready,
  problems,
}: {
  overview: EmailDeliveryOverview | null
  ready: boolean
  problems: string[]
}) {
  const counts = overview?.counts ?? {}
  const failures = overview?.recent_failures ?? []
  return (
    <section aria-labelledby="email-delivery-heading" className="flex flex-col gap-5 rounded-xl border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="email-delivery-heading" className="text-base font-semibold text-foreground">
          Email delivery
        </h2>
        <span
          className={
            ready
              ? 'rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary'
              : 'rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground'
          }
        >
          {ready ? 'Sending' : 'Not sending'}
        </span>
      </div>

      {!ready && problems.length > 0 && (
        <div className="flex flex-col gap-1 rounded-lg border border-dashed p-4">
          <p className="text-sm font-medium text-foreground">Setup needed</p>
          <ul className="list-disc pl-5 text-sm text-muted-foreground">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            In-app notifications keep working. Queued emails send once setup is complete.
          </p>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATUS_LABELS.map(([key, label]) => (
          <div key={key} className="flex flex-col gap-0.5 rounded-lg border p-3">
            <dt className="text-xs text-muted-foreground">{label} (7 days)</dt>
            <dd className="text-lg font-semibold tabular-nums text-foreground">
              {(counts[key] ?? 0) + (key === 'queued' ? counts.sending ?? 0 : 0)}
            </dd>
          </div>
        ))}
      </dl>

      {overview?.oldest_queued_at && (
        <p className="text-sm text-muted-foreground">
          Oldest waiting email was queued {new Date(overview.oldest_queued_at).toLocaleString()}.
        </p>
      )}

      {failures.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-foreground">Recent failures</h3>
          <ul className="flex flex-col divide-y rounded-lg border">
            {failures.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm text-foreground">
                    {categoryLabel(f.category)} to {maskEmail(f.recipient_email)}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {f.last_error ?? 'Unknown error'} · {f.attempts} attempts
                  </span>
                </div>
                <RetryEmailButton id={f.id} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
