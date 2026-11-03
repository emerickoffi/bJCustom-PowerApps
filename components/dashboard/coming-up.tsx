import Link from 'next/link'
import { ArrowRight, CalendarClock } from 'lucide-react'
import { DashboardSectionHeader } from '@/components/dashboard/dashboard-section-header'
import {
  COMING_UP_RANGE_LABELS,
  COMING_UP_RANGES,
  COMING_UP_VISIBLE,
  type ComingUpEvent,
  type ComingUpRange,
} from '@/lib/coming-up'
import { cn } from '@/lib/utils'
import { segmentClass } from '@/lib/interaction-styles'

function DateChip({ iso, tentative }: { iso: string; tentative: boolean }) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const month = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(date)
  return (
    <time
      dateTime={iso}
      className={cn(
        'flex size-11 shrink-0 flex-col items-center justify-center rounded-lg text-primary',
        tentative ? 'border border-dashed border-primary/40 bg-transparent' : 'bg-sage',
      )}
    >
      <span className="text-[0.6rem] font-semibold uppercase tracking-wide leading-none">{month}</span>
      <span className="tabular font-serif text-lg font-semibold leading-tight">{d}</span>
    </time>
  )
}

function RangeControls({ range, hrefFor }: { range: ComingUpRange; hrefFor: (range: ComingUpRange) => string }) {
  return (
    <nav aria-label="Coming up window" className="flex rounded-lg bg-muted p-0.5">
      {COMING_UP_RANGES.map((r) => (
        <Link
          key={r}
          href={hrefFor(r)}
          scroll={false}
          aria-current={r === range ? 'true' : undefined}
          className={cn(
            'flex min-h-9 flex-1 items-center justify-center rounded-md px-2 text-xs font-medium',
            segmentClass(r === range),
            r === range && 'shadow-sm',
          )}
        >
          {COMING_UP_RANGE_LABELS[r]}
        </Link>
      ))}
    </nav>
  )
}

export function ComingUp({
  events,
  range,
  hrefFor,
  scheduleEnabled,
}: {
  events: ComingUpEvent[]
  range: ComingUpRange
  hrefFor: (range: ComingUpRange) => string
  scheduleEnabled: boolean
}) {
  const visible = events.slice(0, COMING_UP_VISIBLE)
  const windowLabel = range === 'today' ? 'today' : `in the ${COMING_UP_RANGE_LABELS[range].toLowerCase()}`
  return (
    <section aria-labelledby="coming-up-heading" className="surface flex flex-col">
      <div className="p-5 md:px-6">
        <DashboardSectionHeader
          id="coming-up-heading"
          title="Coming Up"
          description="Your upcoming schedule"
          icon={CalendarClock}
        />
      </div>
      <div className="flex flex-1 flex-col gap-3 border-t px-5 pb-5 pt-5 md:px-6">
      <RangeControls range={range} hrefFor={hrefFor} />
      {visible.length ? (
        <ul className="flex flex-col divide-y divide-border/60">
          {visible.map((e) => (
            <li key={e.key}>
              <Link
                href={e.href}
                className="group flex items-center gap-3 rounded-lg py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <DateChip iso={e.date} tentative={e.tentative} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-foreground group-hover:text-primary">{e.title}</span>
                    {e.tentative && (
                      <span className="shrink-0 rounded border border-dashed border-muted-foreground/50 px-1 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
                        Tentative
                      </span>
                    )}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {e.assigneeName ? `${e.projectName} · ${e.assigneeName}` : e.projectName}
                  </span>
                  <span
                    className={cn('truncate text-xs', e.tentative ? 'italic text-muted-foreground' : 'text-muted-foreground')}
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
            ? `Nothing open or dated ${windowLabel}.`
            : 'The Schedule module is off, so only proposed starts and warranty milestones appear here.'}
        </p>
      )}
      <div className="flex items-center justify-between gap-2 border-t pt-2">
        <span className="text-xs text-muted-foreground">
          {events.length > COMING_UP_VISIBLE ? `${events.length - COMING_UP_VISIBLE} more ${windowLabel}` : ''}
        </span>
        {scheduleEnabled && (
          <Link
            href="/schedule"
            className="group flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            View schedule
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        )}
      </div>
      </div>
    </section>
  )
}
