import Link from 'next/link'
import { CalendarDays, ChevronRight } from 'lucide-react'
import type { ComingUpEvent } from '@/lib/coming-up'
import { cn } from '@/lib/utils'

const PREVIEW_LIMIT = 3

/**
 * Today's slice of Coming Up. Ongoing activities are already dated today by `buildComingUp`, so filtering on
 * `date === today` covers both work starting today and work overlapping it. Times are not shown because the
 * schedule records dates only.
 */
export function TabletMyDay({
  events,
  today,
  scopedToMe,
  scheduleEnabled,
  agendaHref,
}: {
  events: ComingUpEvent[]
  today: string
  scopedToMe: boolean
  scheduleEnabled: boolean
  /** The standard dashboard's wider date-window controls. */
  agendaHref: string
}) {
  const todays = events.filter((e) => e.date === today)
  const shown = todays.slice(0, PREVIEW_LIMIT)

  return (
    <section aria-labelledby="tablet-my-day-heading" className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-xs">
      <div className="flex items-center justify-between gap-3">
        <h2 id="tablet-my-day-heading" className="type-section-title">
          My day
        </h2>
        {todays.length > 0 && (
          <span className="tabular text-sm text-muted-foreground">{`${todays.length} today`}</span>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {scopedToMe ? 'Nothing assigned to you is scheduled today.' : 'Nothing is scheduled today.'}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-divider">
          {shown.map((e) => (
            <li key={e.key}>
              <Link
                href={e.href}
                className="group flex min-h-11 items-center gap-3 py-2.5 focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground group-hover:text-link">{e.title}</span>
                    {e.tentative && (
                      <span className="shrink-0 rounded-badge border border-champagne/50 bg-champagne-soft px-2 py-0.5 text-[11px] font-medium text-champagne-foreground">
                        Tentative
                      </span>
                    )}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[e.projectName, e.description, e.assigneeName].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {scheduleEnabled && (
          <Link
            href="/schedule"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-interactive-soft px-3 text-sm font-semibold text-interactive-strong hover:bg-interactive-soft-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CalendarDays className="size-4" aria-hidden="true" />
            View schedule
          </Link>
        )}
        <Link
          href={agendaHref}
          className={cn(
            'inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-link hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          Upcoming days
        </Link>
      </div>
    </section>
  )
}
