import Link from 'next/link'
import { cn } from '@/lib/utils'
import { worksheetFillerClass, worksheetStripClass, worksheetTabClass } from '@/components/shared/worksheet-tabs'

export type WorksheetFilter = {
  key: string
  label: string
  href: string
  active: boolean
  count?: number
}

/** Connected worksheet-style filter tabs that sit directly on top of a results surface. */
export function WorksheetFilters({
  label,
  filters,
  noun,
}: {
  label: string
  filters: WorksheetFilter[]
  noun: { one: string; many: string }
}) {
  return (
    <nav aria-label={label} className={worksheetStripClass}>
      <ul className="flex w-max min-w-full items-end">
        {filters.map((f, index) => (
          <li key={f.key} className="flex">
            <Link
              href={f.href}
              scroll={false}
              aria-current={f.active ? 'true' : undefined}
              className={worksheetTabClass(f.active, index === 0)}
            >
              {f.label}
              {f.count !== undefined && (
                <span className={cn('text-xs tabular-nums', f.active ? 'text-foreground/70' : 'text-muted-foreground')}>
                  {f.count}
                  <span className="sr-only">{f.count === 1 ? ` ${noun.one}` : ` ${noun.many}`}</span>
                </span>
              )}
            </Link>
          </li>
        ))}
        <li aria-hidden="true" className={worksheetFillerClass} />
      </ul>
    </nav>
  )
}

/** Results surface that visually connects to the WorksheetFilters strip above it. */
export function worksheetResultsClass(connected: boolean, className?: string) {
  return cn(
    'flex min-w-0 flex-col overflow-hidden rounded-surface border border-border bg-card',
    connected && 'rounded-t-none border-t-0',
    className,
  )
}
