import Link from 'next/link'
import { AlertTriangle, ArrowRight, CircleAlert, CircleCheck, Info, ListChecks } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  ACTION_CATEGORIES,
  ACTION_CATEGORY_LABELS,
  categoryCounts,
  type ActionCategory,
  type ActionItem,
  type ActionSeverity,
} from '@/lib/action-items'
import type { ActionModuleIssue } from '@/lib/attention-data'

const SEVERITY: Record<ActionSeverity, { label: string; icon: typeof Info; tone: string }> = {
  critical: { label: 'Critical', icon: CircleAlert, tone: 'bg-destructive/8 text-destructive' },
  warning: { label: 'Needs action', icon: AlertTriangle, tone: 'bg-champagne-soft text-warning' },
  info: { label: 'Setup', icon: Info, tone: 'bg-muted text-muted-foreground' },
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const formatDate = (iso: string) => DATE_FORMAT.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`))

export type ActionCenterLinks = {
  /** Builds the URL for a category filter and page; kept server-side so filtering never relies on the client. */
  href: (category: ActionCategory | null, page?: number) => string
  viewAll?: string
}

function ActionRow({ item }: { item: ActionItem }) {
  const s = SEVERITY[item.severity]
  const Icon = s.icon
  const date = item.dueDate
    ? { label: `Due ${formatDate(item.dueDate)}`, iso: item.dueDate }
    : item.createdAt
      ? { label: formatDate(item.createdAt), iso: item.createdAt }
      : null
  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', s.tone)}>
          <Icon className="size-4" aria-hidden="true" />
          <span className="sr-only">{s.label}</span>
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="rounded-full bg-sage px-2 py-0.5 font-medium text-primary">{ACTION_CATEGORY_LABELS[item.category]}</span>
            {item.projectName && <span className="font-medium text-primary">{item.projectName}</span>}
            {date && (
              <>
                <span className="text-muted-foreground" aria-hidden="true">
                  ·
                </span>
                <time dateTime={date.iso} className="text-muted-foreground">
                  {date.label}
                </time>
              </>
            )}
          </p>
          <p className="text-pretty text-sm font-semibold leading-snug text-foreground">{item.title}</p>
          {item.description && (
            <p className="line-clamp-2 text-pretty text-xs leading-relaxed text-muted-foreground">{item.description}</p>
          )}
        </div>
      </div>
      <Button
        size="sm"
        variant={item.severity === 'info' ? 'outline' : 'default'}
        render={<Link href={item.href} />}
        nativeButton={false}
        className="min-h-11 shrink-0 self-start sm:min-h-9 sm:self-center"
      >
        {item.actionLabel}
        <ArrowRight data-icon="inline-end" aria-hidden="true" />
        <span className="sr-only">{`: ${item.title}`}</span>
      </Button>
    </li>
  )
}

function CategoryFilters({
  items,
  selected,
  links,
}: {
  items: ActionItem[]
  selected: ActionCategory | null
  links: ActionCenterLinks
}) {
  const counts = categoryCounts(items)
  const present = ACTION_CATEGORIES.filter((c) => counts[c])
  if (present.length < 2 && !selected) return null
  const chip = (active: boolean) =>
    cn(
      'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors',
      active ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-foreground hover:bg-sage/60',
    )
  return (
    <nav aria-label="Filter actions by category" className="-mx-1 overflow-x-auto px-1">
      <ul className="flex w-max gap-2">
        <li>
          <Link href={links.href(null)} scroll={false} className={chip(!selected)} aria-current={!selected ? 'true' : undefined}>
            All <span className="tabular-nums opacity-75">{items.length}</span>
          </Link>
        </li>
        {present.map((c) => (
          <li key={c}>
            <Link href={links.href(c)} scroll={false} className={chip(selected === c)} aria-current={selected === c ? 'true' : undefined}>
              {ACTION_CATEGORY_LABELS[c]} <span className="tabular-nums opacity-75">{counts[c]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function ModuleNotice({ issues }: { issues: ActionModuleIssue[] }) {
  if (!issues.length) return null
  return (
    <div className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground" role="note">
      <p className="font-medium text-foreground">
        {`Not checked: ${issues.map((i) => i.module).join(', ')}`}
      </p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {issues.map((i) => (
          <li key={i.module}>{`${i.module}: ${i.detail}`}</li>
        ))}
      </ul>
    </div>
  )
}

export function ActionCenter({
  items,
  totalIsLowerBound,
  unavailable,
  selected,
  links,
  limit,
  page = 1,
  headingLevel = 'h2',
}: {
  items: ActionItem[]
  totalIsLowerBound: boolean
  unavailable: ActionModuleIssue[]
  selected: ActionCategory | null
  links: ActionCenterLinks
  /** Rows per view: the dashboard shows the top five, the full page paginates. */
  limit: number
  page?: number
  headingLevel?: 'h1' | 'h2'
}) {
  const Heading = headingLevel
  const filtered = selected ? items.filter((i) => i.category === selected) : items
  const pages = Math.max(1, Math.ceil(filtered.length / limit))
  const current = Math.min(Math.max(1, page), pages)
  const visible = filtered.slice((current - 1) * limit, current * limit)
  const countLabel = `${items.length}${totalIsLowerBound ? '+' : ''}`
  const hasCritical = items.some((i) => i.severity === 'critical')

  return (
    <section
      aria-labelledby="action-center-heading"
      className={cn('surface relative flex flex-col gap-5 overflow-hidden p-5 md:p-6', items.length > 0 && 'shadow-lift')}
    >
      {items.length > 0 && (
        <span className={cn('absolute inset-x-0 top-0 h-1', hasCritical ? 'bg-destructive/80' : 'bg-champagne')} aria-hidden="true" />
      )}
      <div className="flex items-start justify-between gap-4 border-b pb-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sage text-primary" aria-hidden="true">
            <ListChecks className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <Heading id="action-center-heading" className="font-serif text-xl font-semibold tracking-tight text-foreground">
              Action Center
            </Heading>
            <p className="text-sm text-muted-foreground">Everything waiting on you, across your projects.</p>
          </div>
        </div>
        {items.length > 0 && (
          <span
            className="flex min-w-11 flex-col items-center rounded-xl bg-brand-deep px-3 py-1.5 text-white"
            aria-label={`${countLabel} open action ${items.length === 1 ? 'item' : 'items'}`}
          >
            <span className="font-serif text-2xl font-semibold leading-none tabular-nums">{countLabel}</span>
            <span className="text-[0.65rem] font-medium uppercase tracking-wide text-champagne" aria-hidden="true">
              Open
            </span>
          </span>
        )}
      </div>

      <CategoryFilters items={items} selected={selected} links={links} />

      {visible.length === 0 ? (
        <div className="flex items-start gap-3 rounded-xl bg-sage/60 p-4" role="status">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-sm font-semibold text-foreground">
              {selected ? `No open ${ACTION_CATEGORY_LABELS[selected]} items` : 'Nothing waiting on you'}
            </p>
            <p className="text-pretty text-sm text-muted-foreground">
              {unavailable.length
                ? 'No open items in the modules that could be checked. See the note below for the rest.'
                : 'Every checked module is clear. Items appear here only when a live record needs action.'}
            </p>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col divide-y">
          {visible.map((item) => (
            <ActionRow key={item.id} item={item} />
          ))}
        </ul>
      )}

      <ModuleNotice issues={unavailable} />

      {links.viewAll && filtered.length > visible.length && (
        <Button variant="outline" render={<Link href={links.viewAll} />} nativeButton={false} className="min-h-11 self-stretch">
          {`View all ${selected ? filtered.length : countLabel}`}
          <ArrowRight data-icon="inline-end" aria-hidden="true" />
        </Button>
      )}

      {!links.viewAll && pages > 1 && (
        <nav aria-label="Action pages" className="flex items-center justify-between gap-3 border-t pt-4 text-sm">
          {current > 1 ? (
            <Button variant="outline" size="sm" render={<Link href={links.href(selected, current - 1)} />} nativeButton={false}>
              Previous
            </Button>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground tabular-nums">{`Page ${current} of ${pages}`}</span>
          {current < pages ? (
            <Button variant="outline" size="sm" render={<Link href={links.href(selected, current + 1)} />} nativeButton={false}>
              Next
            </Button>
          ) : (
            <span />
          )}
        </nav>
      )}
    </section>
  )
}
