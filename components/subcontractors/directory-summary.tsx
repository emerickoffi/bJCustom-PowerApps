import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { DirectorySummary as Summary } from '@/lib/subcontractor-directory'

type Metric = { label: string; value: number | null; href?: string; dot: string }

/** A single understated line of directory-wide counts; values are never estimated. */
export function DirectorySummary({
  summary,
  qualified,
  needsAttention,
}: {
  summary: Summary
  /** Null when vetting is unavailable. */
  qualified: number | null
  needsAttention: number | null
}) {
  const metrics: Metric[] = [
    { label: 'Total', value: summary.total, dot: 'bg-foreground/40' },
    { label: 'Active', value: summary.active, dot: 'bg-primary' },
  ]
  if (qualified !== null) metrics.push({ label: 'Qualified', value: qualified, href: '/subcontractors?qualification=qualified', dot: 'bg-emerald-600' })
  if (needsAttention !== null)
    metrics.push({ label: 'In review or missing items', value: needsAttention, dot: 'bg-warning' })
  if (summary.onProjects !== null) metrics.push({ label: 'On projects', value: summary.onProjects, dot: 'bg-sky-600' })

  return (
    <dl className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
      {metrics.map((m) => {
        const body = (
          <>
            <span className={cn('size-1.5 rounded-full', m.dot)} aria-hidden="true" />
            <dt className="text-muted-foreground">{m.label}</dt>
            <dd className="font-semibold tabular-nums text-foreground">{m.value ?? '—'}</dd>
          </>
        )
        return m.href ? (
          <Link key={m.label} href={m.href} className="flex items-center gap-1.5 rounded-sm underline-offset-4 hover:underline">
            {body}
          </Link>
        ) : (
          <div key={m.label} className="flex items-center gap-1.5">
            {body}
          </div>
        )
      })}
    </dl>
  )
}
