import Link from 'next/link'
import { ArrowRight, CalendarClock } from 'lucide-react'
import { DashboardSectionHeader } from '@/components/dashboard/dashboard-section-header'
import type { ComingUpEvent } from '@/lib/coming-up'
import { cn } from '@/lib/utils'

const VISIBLE = 6

function DateChip({ iso }: { iso: string }) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const month = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(date)
  return (
    <time
      dateTime={iso}
      className="flex size-11 shrink-0 flex-col items-center justify-center rounded-lg bg-sage text-primary"
    >
      <span className="text-[0.6rem] font-semibold uppercase tracking-wide leading-none">{month}</span>
      <span className="tabular font-serif text-lg font-semibold leading-tight">{d}</span>
    </time>
  )
}

export function ComingUp({
  events,
  days,
  scheduleEnabled,
}: {
  events: ComingUpEvent[]
  days: number
  scheduleEnabled: boolean
}) {
  const visible = events.slice(0, VISIBLE)
  return (
    <section aria-labelledby="coming-up-heading" className="surface flex flex-col gap-3 p-4">
      <DashboardSectionHeader
        id="coming-up-heading"
        title="Coming Up"
        description={`Next ${days} days`}
        icon={CalendarClock}
        action={
          scheduleEnabled ? (
            <Link
              href="/schedule"
              className="group flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Schedule
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          ) : undefined
        }
      />
      {visible.length ? (
        <ul className="flex flex-col divide-y divide-border/60">
          {visible.map((e) => (
            <li key={e.key}>
              <Link
                href={e.href}
                className="group flex items-center gap-3 rounded-lg py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <DateChip iso={e.date} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-semibold text-foreground group-hover:text-primary">{e.title}</span>
                  <span className="truncate text-xs text-muted-foreground">{e.projectName}</span>
                  <span
                    className={cn(
                      'truncate text-xs',
                      e.kind === 'proposed_start' ? 'italic text-muted-foreground' : 'text-muted-foreground/80',
                    )}
                  >
                    {e.description}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          {scheduleEnabled
            ? `Nothing dated in the next ${days} days.`
            : 'The Schedule module is off, so only proposed starts and warranty milestones appear here.'}
        </p>
      )}
      {events.length > VISIBLE && (
        <p className="text-xs text-muted-foreground">{`${events.length - VISIBLE} more in this window`}</p>
      )}
    </section>
  )
}
