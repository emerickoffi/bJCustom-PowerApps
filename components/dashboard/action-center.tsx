import Link from 'next/link'
import {
  ArrowRight,
  CalendarClock,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  ClipboardList,
  FileCheck2,
  FileText,
  ListChecks,
  Receipt,
  Settings2,
  ShieldCheck,
  UserRound,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  ACTION_CATEGORIES,
  ACTION_CATEGORY_LABELS,
  categoryCounts,
  type ActionCategory,
  type ActionItem,
} from '@/lib/action-items'
import type { ActionModuleIssue } from '@/lib/attention-data'

const CATEGORY_ICONS: Record<ActionCategory, LucideIcon> = {
  approvals: FileCheck2,
  schedule: CalendarClock,
  financial: Receipt,
  documents: FileText,
  client_data: UserRound,
  compliance: ShieldCheck,
  punch_list: ClipboardList,
  warranty: Wrench,
  setup: Settings2,
}

const BRONZE_ICON_CATEGORIES = new Set<ActionCategory>(['approvals', 'documents'])

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const formatDate = (iso: string) => DATE_FORMAT.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`))

/** Urgency shown only where the source record backs it: a past real deadline, or a rule-assigned critical severity. */
function urgencyOf(item: ActionItem, today: string): string | null {
  if (item.dueDate && item.dueDate.slice(0, 10) < today) return 'Overdue'
  if (item.severity === 'critical') return 'Critical'
  return null
}

export type ActionCenterLinks = {
  /** Builds the URL for a category filter and page; kept server-side so filtering never relies on the client. */
  href: (category: ActionCategory | null, page?: number) => string
  viewAll?: string
}

function ActionRow({ item, today }: { item: ActionItem; today: string }) {
  const Icon = CATEGORY_ICONS[item.category]
  const urgency = urgencyOf(item, today)
  const date = item.dueDate
    ? { label: `Due ${formatDate(item.dueDate)}`, iso: item.dueDate }
    : item.createdAt
      ? { label: `Created ${formatDate(item.createdAt)}`, iso: item.createdAt }
      : null
  const meta = [item.projectName, ACTION_CATEGORY_LABELS[item.category]].filter(Boolean) as string[]
  return (
    <li className="flex gap-3 py-3.5 first:pt-0 last:pb-0">
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full bg-[#F5EDDF]',
          BRONZE_ICON_CATEGORIES.has(item.category) ? 'text-[#805B2A]' : 'text-primary',
        )}
        aria-hidden="true"
      >
        <Icon className="size-[18px]" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-pretty text-sm font-semibold leading-snug text-foreground">{item.title}</p>
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
            {urgency && (
              <span className="inline-flex items-center gap-1 font-medium text-destructive">
                <CircleAlert className="size-3.5" aria-hidden="true" />
                {urgency}
                <span aria-hidden="true" className="text-muted-foreground">
                  ·
                </span>
              </span>
            )}
            {meta.map((m, i) => (
              <span key={m} className={cn(i === 0 && item.projectName && 'font-medium text-foreground/80')}>
                {i > 0 && (
                  <span aria-hidden="true" className="mr-1.5">
                    ·
                  </span>
                )}
                {m}
              </span>
            ))}
            {date && (
              <span>
                <span aria-hidden="true" className="mr-1.5">
                  ·
                </span>
                <time dateTime={date.iso} className={cn(urgency === 'Overdue' && 'font-medium text-destructive')}>
                  {date.label}
                </time>
              </span>
            )}
          </p>
          {item.description && (
            <p className="line-clamp-2 text-pretty text-xs leading-relaxed text-muted-foreground sm:line-clamp-1">
              {item.description}
            </p>
          )}
          {item.details && (
            <details className="group/details text-xs text-muted-foreground">
              <summary className="inline-flex min-h-6 cursor-pointer list-none items-center gap-1 rounded-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <ChevronDown className="size-3.5 transition-transform group-open/details:rotate-180" aria-hidden="true" />
                Details
              </summary>
              <p className="mt-1 text-pretty leading-relaxed">{item.details}</p>
            </details>
          )}
        </div>
        <Link
          href={item.href}
          className="group -mx-2 inline-flex min-h-11 shrink-0 items-center gap-1.5 self-start rounded-md px-2 text-sm font-medium text-[#805B2A] underline-offset-4 hover:text-[#62421D] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:mx-0 sm:self-center"
        >
          {item.actionLabel}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          <span className="sr-only">{`: ${item.title}`}</span>
        </Link>
      </div>
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
  const tab = (active: boolean) =>
    cn(
      '-mb-px inline-flex min-h-10 items-center gap-1.5 border-b-2 px-1 text-sm transition-colors focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      active
        ? 'border-primary font-semibold text-primary'
        : 'border-transparent font-medium text-muted-foreground hover:border-[#9FB3A7] hover:text-foreground',
    )
  const count = (active: boolean, n: number) => (
    <span
      className={cn(
        'rounded-full px-1.5 text-xs tabular-nums',
        active ? 'bg-sage text-primary' : 'bg-muted text-muted-foreground',
      )}
    >
      {n}
    </span>
  )
  return (
    <nav aria-label="Filter actions by category" className="-mx-1 overflow-x-auto px-1">
      <ul className="flex w-max min-w-full gap-5 border-b">
        <li>
          <Link href={links.href(null)} scroll={false} className={tab(!selected)} aria-current={!selected ? 'true' : undefined}>
            All {count(!selected, items.length)}
          </Link>
        </li>
        {present.map((c) => (
          <li key={c}>
            <Link href={links.href(c)} scroll={false} className={tab(selected === c)} aria-current={selected === c ? 'true' : undefined}>
              {ACTION_CATEGORY_LABELS[c]} {count(selected === c, counts[c] ?? 0)}
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
  const today = new Date().toISOString().slice(0, 10)

  return (
    <section aria-labelledby="action-center-heading" className="surface flex flex-col">
      <div className="flex items-center gap-3 rounded-t-[inherit] border-b border-[#D8DED8] bg-card px-4 py-3 md:px-6">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sage text-primary" aria-hidden="true">
          <ListChecks className="size-[18px]" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Heading id="action-center-heading" className="font-serif text-xl font-semibold leading-tight tracking-tight text-foreground">
              Action Center
            </Heading>
            {items.length > 0 && (
              <span className="rounded-full border border-primary/15 bg-sage px-2 py-px text-xs font-medium leading-4 tabular-nums text-primary">
                {`${countLabel} pending`}
              </span>
            )}
          </div>
          <p className="text-pretty text-[13px] leading-[18px] text-muted-foreground">
            Everything waiting on you, across your projects.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-b-[inherit] bg-card px-4 pb-4 pt-3 md:px-6 md:pb-6 md:pt-4">
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
            <ActionRow key={item.id} item={item} today={today} />
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
      </div>
    </section>
  )
}
