import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  QUALIFICATION_FILTERS,
  QUALIFICATION_FILTER_LABELS,
  QUALIFICATION_SORTS,
  QUALIFICATION_SORT_LABELS,
  type QualificationFilter,
  type QualificationSort,
} from '@/lib/subcontractor-qualification'

export function QualificationFilterChips({
  active,
  sort = 'name',
  baseParams,
  counts,
}: {
  active: QualificationFilter | null
  sort?: QualificationSort
  baseParams: Record<string, string | undefined>
  counts: Record<QualificationFilter, number>
}) {
  function href(value: QualificationFilter | null, nextSort: QualificationSort = sort) {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(baseParams)) if (v) p.set(k, v)
    if (value) p.set('qualification', value)
    if (nextSort !== 'name') p.set('sort', nextSort)
    const s = p.toString()
    return s ? `/subcontractors?${s}` : '/subcontractors'
  }
  const chip = (selected: boolean) =>
    cn(
      'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
      selected
        ? 'border-primary bg-primary text-primary-foreground'
        : 'border-border bg-card text-foreground/80 hover:border-primary/30 hover:text-primary',
    )
  return (
    <div className="flex flex-col gap-3">
    <nav aria-label="Filter by qualification" className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Qualification</span>
      <Link href={href(null)} className={chip(active === null)} aria-current={active === null ? 'page' : undefined}>
        All
      </Link>
      {QUALIFICATION_FILTERS.map((f) => (
        <Link key={f} href={href(f)} className={chip(active === f)} aria-current={active === f ? 'page' : undefined}>
          {QUALIFICATION_FILTER_LABELS[f]}
          <span className={cn('tabular-nums', active === f ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
            {counts[f]}
          </span>
        </Link>
      ))}
    </nav>
    <nav aria-label="Sort subcontractors" className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Sort</span>
      {QUALIFICATION_SORTS.map((s) => (
        <Link key={s} href={href(active, s)} className={chip(sort === s)} aria-current={sort === s ? 'true' : undefined}>
          {QUALIFICATION_SORT_LABELS[s]}
        </Link>
      ))}
    </nav>
    </div>
  )
}
