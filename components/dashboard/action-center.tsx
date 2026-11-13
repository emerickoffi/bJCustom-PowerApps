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
import { CardSectionIcon } from '@/components/shared/card-section-header'
import { cn } from '@/lib/utils'
import {
  ACTION_CATEGORIES,
  ACTION_CATEGORY_LABELS,
  categoryCounts,
  type ActionCategory,
  type ActionItem,
} from '@/lib/action-items'
import type { ActionModuleIssue } from '@/lib/attention-data'
import { actionListClear } from '@/lib/work-scope'

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
    <li className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[#F2FAFB]">
      <span
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[#FFF1E6] text-[#B54708]"
        aria-hidden="true"
      >
        <Icon className="size-4" strokeWidth={2} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-pretty text-sm font-semibold leading-snug text-[#17212B]">
            <Link
              href={item.href}
              className="rounded-sm underline-offset-4 hover:text-[#007F95] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007F95]"
            >
              {item.title}
            </Link>
          </p>
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-[#526173]">
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
              <span key={m} className={cn(i === 0 && item.projectName && 'font-medium text-[#17212B]/80')}>
                {i > 0 && (
                  <span aria-hidden="true" className="mr-1.5">
                    ·
                  </span>
                )}
                {m}
              </span>
            ))}
          </p>
          {item.description && (
            <p className="line-clamp-2 text-pretty text-xs leading-relaxed text-[#526173]">{item.description}</p>
          )}
          {item.details && (
            <details className="group/details text-xs text-[#526173]">
              <summary className="inline-flex min-h-6 cursor-pointer list-none items-center gap-1 rounded-sm font-medium text-[#007F95] hover:text-[#006B7E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007F95] [&::-webkit-details-marker]:hidden">
                <ChevronDown className="size-3.5 transition-transform group-open/details:rotate-180" aria-hidden="true" />
                Details
              </summary>
              <p className="mt-1 text-pretty leading-relaxed">{item.details}</p>
            </details>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 sm:shrink-0 sm:flex-nowrap sm:justify-end">
          {date && (
            <time
              dateTime={date.iso}
              className={cn(
                'whitespace-nowrap text-xs tabular-nums text-[#526173] sm:w-32 sm:text-right',
                urgency === 'Overdue' && 'font-medium text-[#B54708]',
              )}
            >
              {date.label}
            </time>
          )}
          <ActionButton item={item} />
        </div>
      </div>
    </li>
  )
}

/** Compact review button; it only opens the record, never approves or completes it. */
function ActionButton({ item }: { item: ActionItem }) {
  const Icon = ACTION_ICONS[item.actionLabel] ?? ArrowRight
  const name = item.actionName ?? `${item.actionLabel}: ${item.title}`
  return (
    // The link is a 44px touch target; the visible teal button inside stays compact.
    <Link
      href={item.href}
      aria-label={name}
      title={name}
      className="group/btn -my-1.5 ml-auto flex min-h-11 shrink-0 items-center rounded-md focus-visible:outline-none sm:ml-0 [&:focus-visible>span]:ring-2 [&:focus-visible>span]:ring-[#007F95] [&:focus-visible>span]:ring-offset-2"
    >
      <span className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md bg-[#007F95] px-3 text-xs font-semibold text-white shadow-xs transition-colors group-hover/btn:bg-[#006B7E]">
        <Icon className="size-3.5" strokeWidth={2.25} aria-hidden="true" />
        {item.actionLabel}
      </span>
    </Link>
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
        'rounded-badge px-1.5 text-xs font-semibold tabular-nums',
        active ? 'bg-interactive text-white' : 'bg-secondary text-[#526173]',
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
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-primary" aria-hidden="true">
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
  priorities,
  prioritiesClear = false,
}: {
  /** Controls shown at the right of the header, e.g. the work-scope selector. */
  headerActions?: ReactNode
  /** Daily Priorities briefing shown above the category filters. */
  priorities?: ReactNode
  /** The briefing loaded fully and is empty; with an empty list, the briefing renders the single empty state. */
  prioritiesClear?: boolean
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
  const allClear =
    !!priorities && prioritiesClear && actionListClear({ itemCount: items.length, unavailableCount: unavailable.length })

  return (
    <section aria-labelledby="action-center-heading" className="surface flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-t-[inherit] border-b border-[#D6DDE5] bg-white px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
        <CardSectionIcon icon={ClipboardList} tone="teal" size="lg" />
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <Heading id="action-center-heading" className="type-section-title text-[#17212B]">
            Action Center
          </Heading>
          {items.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-badge border border-[#FDBA74] bg-[#FFF1E6] px-2 py-0.5 text-xs font-medium leading-4 text-[#B54708]">
              <span className="font-bold tabular-nums">{countLabel}</span>
              {items.length === 1 && !totalIsLowerBound ? 'needs attention' : 'need attention'}
            </span>
          )}
        </div>
        </div>
        {headerActions && <div className="ml-auto flex shrink-0 items-center">{headerActions}</div>}
      </div>

      {allClear ? (
        <div className="rounded-b-[inherit] bg-white px-4 py-3">{priorities}</div>
      ) : (
      <div className="flex flex-col gap-3 rounded-b-[inherit] bg-white px-4 pb-4 pt-2">
      {priorities && <div className="pt-2">{priorities}</div>}
      <CategoryFilters items={items} selected={selected} links={links} />

      {visible.length === 0 ? (
        <EmptyState
          selected={selected}
          otherPending={items.length}
          partial={unavailable.length > 0}
          viewAllHref={links.href(null)}
        />
      ) : (
        <ul className="-mx-4 flex flex-col divide-y divide-[#D6DDE5]">
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
      )}
    </section>
  )
}
