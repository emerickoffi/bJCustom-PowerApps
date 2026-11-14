import Link from 'next/link'
import { AlertTriangle, ArrowRight, CircleCheck, MessagesSquare, Search } from 'lucide-react'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  COMM_PAGE_SIZE,
  COMM_TYPE_LABELS,
  COMM_TYPES,
  applyCommFilters,
  commHref,
  type CommFilters,
  type CommType,
  type CommunicationItem,
} from '@/lib/project-communications'

type Params = Record<string, string | string[] | undefined>

export function ProjectCommunications({
  projectId,
  attention,
  activity,
  incomplete,
  filters,
  params,
  userId,
}: {
  projectId: string
  attention: CommunicationItem[]
  activity: CommunicationItem[]
  incomplete: boolean
  filters: CommFilters
  params: Params
  userId: string
}) {
  const base = `/projects/${encodeURIComponent(projectId)}`
  const source = filters.view === 'attention' ? attention : activity
  const filtered = applyCommFilters(source, filters, userId)
  const visible = filtered.slice(0, filters.limit)
  const presentTypes = new Set(source.map((i) => i.type))
  const typeOptions = COMM_TYPES.filter((t) => presentTypes.has(t) || t === filters.type)
  const href = (next: Partial<CommFilters>) => commHref(base, params, { limit: COMM_PAGE_SIZE, ...next })
  const filtering = Boolean(filters.type || filters.q || (filters.mine && filters.view === 'attention'))

  return (
    <section id="communications" aria-labelledby="communications-heading" className="surface flex scroll-mt-36 flex-col gap-4 p-4 sm:p-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sage text-primary">
            <MessagesSquare className="size-4" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id="communications-heading" className="type-section-title text-foreground">
              Communications
            </h2>
            <p className="text-sm text-muted-foreground">
              Questions, issues, updates, and quotes for this job. Each one opens where the work happens.
            </p>
          </div>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {"Today's priorities"}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </header>

      <nav aria-label="Communication views" className="flex gap-1 border-b border-border">
        {(
          [
            { view: 'attention', label: 'Needs Attention', count: attention.length },
            { view: 'activity', label: 'All Activity', count: null },
          ] as const
        ).map((tab) => {
          const active = filters.view === tab.view
          return (
            <Link
              key={tab.view}
              href={href({ view: tab.view, type: null, mine: false, q: '' })}
              aria-current={active ? 'page' : undefined}
              scroll={false}
              className={cn(
                '-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
              {tab.count !== null && (
                <span
                  className={cn(
                    'rounded-full px-1.5 text-xs tabular-nums',
                    tab.count > 0 ? 'bg-champagne-soft text-warning' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {tab.count}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <ul className="flex flex-wrap gap-1.5" aria-label="Filter by type">
          <FilterChip href={href({ type: null })} active={!filters.type} label="All types" />
          {typeOptions.map((t: CommType) => (
            <FilterChip key={t} href={href({ type: t })} active={filters.type === t} label={COMM_TYPE_LABELS[t]} />
          ))}
          {filters.view === 'attention' && (
            <FilterChip href={href({ mine: !filters.mine })} active={filters.mine} label="Assigned to me" />
          )}
        </ul>
        <form action={`${base}#communications`} method="get" role="search" className="flex items-center gap-2">
          {Object.entries(params).map(([k, v]) => {
            const value = Array.isArray(v) ? v[0] : v
            return !value || k === 'cq' || k === 'cmore' ? null : <input key={k} type="hidden" name={k} value={value} />
          })}
          <label htmlFor="communications-search" className="sr-only">
            Search communications
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              id="communications-search"
              name="cq"
              type="search"
              defaultValue={filters.q}
              maxLength={80}
              placeholder="Search this job"
              className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring lg:w-56"
            />
          </div>
          <button
            type="submit"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Search
          </button>
        </form>
      </div>

      {incomplete && (
        <p role="status" className="flex items-center gap-2 rounded-md bg-champagne-soft px-3 py-2 text-sm text-warning">
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          Some sources could not load, so this list may be incomplete. Reload to try again.
        </p>
      )}

      {visible.length === 0 ? (
        <EmptyState view={filters.view} filtering={filtering} incomplete={incomplete} clearHref={href({ type: null, mine: false, q: '' })} />
      ) : (
        <ul className="flex flex-col divide-y divide-border" aria-label={filters.view === 'attention' ? 'Needs attention' : 'All activity'}>
          {visible.map((item) => (
            <CommunicationRow key={item.id} item={item} />
          ))}
        </ul>
      )}

      {filtered.length > visible.length && (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3 text-sm">
          <span className="text-muted-foreground">
            Showing {visible.length} of {filtered.length}
          </span>
          <Link href={href({ ...filters, limit: filters.limit + COMM_PAGE_SIZE })} scroll={false} className="font-medium text-primary underline-offset-4 hover:underline">
            Show more
          </Link>
        </div>
      )}
    </section>
  )
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <li>
      <Link
        href={href}
        scroll={false}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'inline-flex h-8 items-center rounded-full border px-3 text-sm transition-colors',
          active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-foreground hover:bg-muted',
        )}
      >
        {label}
      </Link>
    </li>
  )
}

function CommunicationRow({ item }: { item: CommunicationItem }) {
  const when = item.date ? formatDate(item.date) : null
  return (
    <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-sage px-1.5 py-0.5 text-xs font-medium text-primary">{COMM_TYPE_LABELS[item.type]}</span>
          {item.overdue && <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive">Overdue</span>}
          <span className="truncate font-medium text-foreground">{item.title}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {item.status}
          {when && (
            <>
              {' · '}
              {item.dateLabel ? `${item.dateLabel} ` : ''}
              <time dateTime={item.date ?? undefined}>{when}</time>
            </>
          )}
          {item.responsibleName && <>{` · ${item.responsibleName}`}</>}
        </p>
        {item.context && <p className="line-clamp-1 text-sm text-muted-foreground">{item.context}</p>}
      </div>
      <Link
        href={item.href}
        className="inline-flex shrink-0 items-center gap-1 self-start rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:self-center"
      >
        {item.actionLabel}
        <ArrowRight className="size-3.5" aria-hidden="true" />
        <span className="sr-only">: {item.title}</span>
      </Link>
    </li>
  )
}

function EmptyState({ view, filtering, incomplete, clearHref }: { view: CommFilters['view']; filtering: boolean; incomplete: boolean; clearHref: string }) {
  if (filtering) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nothing matches these filters.{' '}
        <Link href={clearHref} scroll={false} className="font-medium text-primary underline-offset-4 hover:underline">
          Clear filters
        </Link>
      </p>
    )
  }
  if (incomplete) return <p className="py-6 text-center text-sm text-muted-foreground">Nothing could be confirmed right now.</p>
  return (
    <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
      {view === 'attention' ? (
        <>
          <CircleCheck className="size-4 text-primary" aria-hidden="true" />
          Nothing on this job is waiting on you.
        </>
      ) : (
        'No activity on this job yet.'
      )}
    </p>
  )
}
