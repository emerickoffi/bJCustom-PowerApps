import Link from 'next/link'
import { cn } from '@/lib/utils'
import { WORK_SCOPE_OPTIONS, type WorkScope } from '@/lib/work-scope'

/**
 * Link-driven twin of the Dashboard's WorkScopeControl: same labels, order, and styling, but the choice lives in the
 * URL so server-rendered sections (Project Overview, Communications) can filter without a client round trip.
 */
export function WorkScopeLinks({
  label,
  scope,
  hrefs,
  counts,
}: {
  label: string
  scope: WorkScope
  hrefs: Record<WorkScope, string>
  /** `null` means the count can't be confirmed (a source failed), so a dash is shown instead of a number. */
  counts?: Record<WorkScope, number | null>
}) {
  return (
    <nav aria-label={label} className="flex shrink-0 rounded-lg bg-muted p-0.5">
      {WORK_SCOPE_OPTIONS.map((o) => {
        const active = o.value === scope
        const count = counts?.[o.value]
        return (
          <Link
            key={o.value}
            href={hrefs[o.value]}
            scroll={false}
            replace
            aria-current={active ? 'true' : undefined}
            className={cn(
              'flex min-h-9 items-center justify-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 motion-reduce:transition-none',
              active
                ? 'border-[#007F8B] bg-[#007F8B] text-white shadow-sm hover:border-[#006773] hover:bg-[#006773]'
                : 'border-transparent text-foreground hover:bg-background hover:text-[#006773]',
            )}
          >
            {o.label}
            {counts && (
              <span className={cn('tabular-nums', active ? 'text-white/85' : 'text-muted-foreground')}>
                {count === null || count === undefined ? '—' : count}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
