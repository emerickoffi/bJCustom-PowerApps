import type { ReactNode } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  CalendarClock,
  CalendarPlus,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  ClipboardCheck,
  ClipboardList,
  Contact,
  FileCheck2,
  FilePen,
  FileSearch,
  FileText,
  Files,
  ListChecks,
  ListFilter,
  MapPin,
  NotebookText,
  Receipt,
  ScanSearch,
  Settings2,
  ShieldCheck,
  ShieldQuestion,
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

/** Category tabs use review-oriented icons where the spec calls for them; others reuse the row icon. */
const TAB_ICONS: Partial<Record<ActionCategory, LucideIcon>> = {
  approvals: ClipboardCheck,
  documents: Files,
  compliance: ShieldCheck,
}

/** Keyed by the existing action label so the icon always matches what the button does. */
const ACTION_ICONS: Record<string, LucideIcon> = {
  'Review Signed Document': FileSearch,
  'Review Estimate': ScanSearch,
  'Review Change Order': FilePen,
  'Review Qualification': ShieldQuestion,
  'Review Invoice': Receipt,
  'View Schedule': CalendarClock,
  'Build Schedule': CalendarPlus,
  'Open Log': NotebookText,
  'Manage Contacts': Contact,
  'Add Jobsite Address': MapPin,
  'Resolve Issue': CircleAlert,
  'Review Issue': CircleAlert,
  'Open Warranty Claim': Wrench,
  'Open Warranty': Wrench,
}


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
    <li className="flex items-start gap-3 py-4 first:pt-1 last:pb-1">
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-link-soft text-link"
        aria-hidden="true"
      >
        <Icon className="size-[18px]" />
      </span>
      <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-pretty text-[15px] font-semibold leading-snug text-foreground">
            <Link
              href={item.href}
              className="rounded-sm underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {item.title}
            </Link>
          </p>
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
        <ActionIconLink item={item} />
      </div>
    </li>
  )
}

/** Compact review button; it only opens the record, never approves or completes it. */
function ActionIconLink({ item }: { item: ActionItem }) {
  const Icon = ACTION_ICONS[item.actionLabel] ?? ArrowRight
  const name = item.actionName ?? `${item.actionLabel}: ${item.title}`
  return (
    // -mt-3 centres the 44px target on the title's first line so every button sits in the same column and row position.
    <span className="group/tip relative -mt-3 shrink-0">
      <Link
        href={item.href}
        aria-label={name}
        className="group/btn flex size-11 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174D38] focus-visible:ring-offset-2"
      >
        <span className="flex size-10 items-center justify-center rounded-lg border border-[#C9DCCE] bg-[#E7F0E9] text-[#174D38] transition-colors group-hover/btn:bg-[#D5E6DA] group-hover/btn:text-[#123D2E]">
          <Icon className="size-[19px]" strokeWidth={2} aria-hidden="true" />
        </span>
      </Link>
      <span
        aria-hidden="true"
        className="pointer-events-none invisible absolute right-full top-1/2 z-20 mr-2 w-max max-w-60 -translate-y-1/2 rounded-md bg-[#17212B] px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-md transition-opacity group-focus-within/tip:visible group-focus-within/tip:opacity-100 group-hover/tip:visible group-hover/tip:opacity-100"
      >
        {name}
      </span>
    </span>
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
  // A filter from the URL stays visible as a tab even when it has no items, so the active scope is never hidden.
  const present = ACTION_CATEGORIES.filter((c) => counts[c] || c === selected)
  if (present.length < 2 && !selected) return null
  const tab = (active: boolean) =>
    cn(
      '-mb-px inline-flex min-h-11 items-center gap-1.5 border-b-[3px] px-1 text-sm transition-colors focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive/50',
      active
        ? 'border-interactive font-semibold text-interactive-strong'
        : 'border-transparent font-medium text-muted-foreground hover:border-interactive-border hover:text-interactive-strong',
    )
  const count = (active: boolean, n: number) => (
    <span
      className={cn(
        'rounded-full px-1.5 text-xs font-semibold tabular-nums',
        active ? 'bg-interactive text-white' : 'bg-[#EEF1EE] text-[#526173]',
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
            <ListFilter className="size-4 shrink-0" aria-hidden="true" />
            All {count(!selected, items.length)}
          </Link>
        </li>
        {present.map((c) => {
          const TabIcon = TAB_ICONS[c] ?? CATEGORY_ICONS[c]
          return (
            <li key={c}>
              <Link href={links.href(c)} scroll={false} className={tab(selected === c)} aria-current={selected === c ? 'true' : undefined}>
                <TabIcon className="size-4 shrink-0" aria-hidden="true" />
                {ACTION_CATEGORY_LABELS[c]} {count(selected === c, counts[c] ?? 0)}
              </Link>
            </li>
          )
        })}
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

function EmptyState({
  selected,
  otherPending,
  partial,
  viewAllHref,
}: {
  selected: ActionCategory | null
  /** Items in the whole queue; only reached when the current filter shows none. */
  otherPending: number
  partial: boolean
  viewAllHref: string
}) {
  const filteredWithOthers = selected && otherPending > 0
  const title = selected
    ? `No pending ${ACTION_CATEGORY_LABELS[selected]} items`
    : partial
      ? 'Nothing pending in the modules checked'
      : 'Nothing needs your attention'
  const detail = filteredWithOthers
    ? `${otherPending} item${otherPending === 1 ? '' : 's'} still pending in other categories.`
    : partial
      ? 'Some modules could not be checked. See the note below.'
      : selected
        ? 'Other categories are clear too.'
        : 'Items appear here when a live record needs action.'
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-5" role="status">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#EEF1EE] text-primary" aria-hidden="true">
        <CircleCheck className="size-[18px]" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-sm font-semibold text-[#17212B]">{title}</p>
        <p className="text-pretty text-sm text-[#526173]">{detail}</p>
      </div>
      {filteredWithOthers && (
        <Link
          href={viewAllHref}
          scroll={false}
          className="group inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-link underline-offset-4 hover:text-link-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          View all pending items
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      )}
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
  headerActions,
}: {
  /** Controls shown at the right of the header, e.g. the work-scope selector. */
  headerActions?: ReactNode
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
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-t-[inherit] border-b border-[#D6DDE5] bg-card px-4 py-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-link-soft text-link" aria-hidden="true">
            <ListChecks className="size-[18px]" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Heading id="action-center-heading" className="font-serif text-xl font-semibold leading-tight tracking-tight text-[#17212B]">
                Action Center
              </Heading>
              {items.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[#FDBA74] bg-[#FFF1E6] px-2 py-px text-xs font-medium leading-4 text-[#B54708]">
                  <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="font-bold tabular-nums">{countLabel}</span>
                  {items.length === 1 && !totalIsLowerBound ? 'needs attention' : 'need attention'}
                </span>
              )}
            </div>
            <p className="text-pretty text-[13px] leading-[18px] text-[#526173]">
              Everything waiting on you, across your projects.
            </p>
          </div>
        </div>
        {headerActions && <div className="flex shrink-0 items-center">{headerActions}</div>}
      </div>

      <div className="flex flex-col gap-4 rounded-b-[inherit] bg-card px-4 pb-4 pt-3 md:px-6 md:pb-6 md:pt-4">
      <CategoryFilters items={items} selected={selected} links={links} />

      {visible.length === 0 ? (
        <EmptyState
          selected={selected}
          otherPending={items.length}
          partial={unavailable.length > 0}
          viewAllHref={links.href(null)}
        />
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
