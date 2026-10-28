import {
  CalendarCheck,
  CalendarRange,
  CircleDot,
  PencilLine,
  Plus,
  Trash2,
  TrendingUp,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { HistoryCategory, PresentedEvent } from '@/lib/activity-history'

const CATEGORY_ICONS: Record<HistoryCategory, LucideIcon> = {
  created: Plus,
  deleted: Trash2,
  progress: TrendingUp,
  status: CircleDot,
  planned_dates: CalendarRange,
  actual_dates: CalendarCheck,
  assignment: UserRound,
  details: PencilLine,
}

export function EventIcon({ event }: { event: PresentedEvent }) {
  const key = event.categories[0]?.key ?? 'details'
  const Icon = CATEGORY_ICONS[key]
  return (
    <span
      aria-hidden="true"
      className={cn(
        'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg',
        key === 'deleted' ? 'bg-[#FDE8E7] text-[#BD302B]' : 'bg-[#EAF0E9] text-[#174D32]',
      )}
    >
      <Icon className="size-3.5" />
    </span>
  )
}

function eventHeadline(event: PresentedEvent) {
  if (event.eventType === 'created') return `Added ${event.activityName}`
  if (event.eventType === 'deleted') return `Removed ${event.activityName}`
  return event.activityName
}

/** Compact one-line summary used on the Schedule page. */
export function CompactHistoryItem({ event }: { event: PresentedEvent }) {
  return (
    <li className="flex gap-3 px-4 py-3">
      <EventIcon event={event} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="min-w-0 truncate text-sm font-medium text-[#103B27]">{eventHeadline(event)}</span>
          <time dateTime={event.createdAt} className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {`${event.dateLabel} · ${event.timeLabel}`}
          </time>
        </div>
        {event.eventType === 'updated' && <p className="line-clamp-2 text-sm text-muted-foreground">{event.action}</p>}
        <span className="text-xs text-muted-foreground">{`By ${event.actorName}`}</span>
      </div>
    </li>
  )
}

/** Full detail row used inside the history drawer. */
export function DetailedHistoryItem({ event }: { event: PresentedEvent }) {
  const valueChanges = event.changes.filter((c) => !c.textOnly)
  const textChanges = event.changes.filter((c) => c.textOnly)
  return (
    <li className="flex gap-3 rounded-xl border border-[#E2E8E2] bg-white p-4">
      <EventIcon event={event} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="break-words text-sm font-semibold text-[#103B27]">{eventHeadline(event)}</span>
            <div className="flex flex-wrap gap-1">
              {event.categories.map((c) => (
                <span key={c.key} className="rounded-md bg-[#EAF0E9] px-1.5 py-0.5 text-[11px] font-medium text-[#174D32]">
                  {c.label}
                </span>
              ))}
            </div>
          </div>
          <time dateTime={event.createdAt} className="shrink-0 text-xs tabular-nums text-muted-foreground sm:text-right">
            {event.dateLabel}
            <span className="block">{event.timeLabel}</span>
          </time>
        </div>

        {valueChanges.length > 0 && (
          <dl className="flex flex-col divide-y divide-[#E2E8E2] rounded-lg border border-[#E2E8E2] bg-[#F8F7F3] text-sm">
            {valueChanges.map((c) => (
              <div key={c.field} className="grid gap-1 px-3 py-2 sm:grid-cols-[8rem_1fr] sm:gap-3">
                <dt className="text-xs font-medium text-[#103B27]/70">{c.label}</dt>
                <dd className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 break-words text-[#103B27]">
                  <span className="text-muted-foreground">
                    <span className="sr-only">Previous value: </span>
                    {c.from}
                  </span>
                  <span aria-hidden="true" className="text-muted-foreground">
                    {'→'}
                  </span>
                  <span className="font-medium">
                    <span className="sr-only">New value: </span>
                    {c.to}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        )}
        {textChanges.length > 0 && (
          <p className="text-xs text-muted-foreground">{`${textChanges.map((c) => c.label).join(', ')} updated (text not shown)`}</p>
        )}
        <span className="text-xs text-muted-foreground">{`Changed by ${event.actorName}`}</span>
      </div>
    </li>
  )
}
