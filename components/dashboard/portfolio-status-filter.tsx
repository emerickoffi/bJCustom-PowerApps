import Link from 'next/link'
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'
import type { PortfolioStatusCount } from '@/lib/portfolio'
import { cn } from '@/lib/utils'

function Chip({ href, label, count, active }: { href: string; label: string; count: number; active: boolean }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
      )}
    >
      {label}
      <span className={cn('tabular text-xs', active ? 'text-primary-foreground/75' : 'text-muted-foreground/80')}>
        {count}
      </span>
    </Link>
  )
}

export function PortfolioStatusFilter({
  counts,
  total,
  selected,
}: {
  counts: PortfolioStatusCount[]
  total: number
  selected: ProjectStatus | null
}) {
  return (
    <nav aria-label="Filter projects by status" className="-mx-1 overflow-x-auto px-1 pb-1">
      <ul className="flex w-max gap-2">
        <li>
          <Chip href="/dashboard" label="All" count={total} active={!selected} />
        </li>
        {counts.map(({ status, count }) => (
          <li key={status}>
            <Chip
              href={`/dashboard?portfolio=${status}`}
              label={PROJECT_STATUS_LABELS[status]}
              count={count}
              active={selected === status}
            />
          </li>
        ))}
      </ul>
    </nav>
  )
}
