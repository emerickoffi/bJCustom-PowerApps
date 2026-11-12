import Link from 'next/link'
import { Flag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format'
import { HEALTH_LABELS, PHASE_STATE_LABELS, type JobTimeline as Timeline, type PhaseState, type ScheduleHealth } from '@/lib/job-timeline'

const HEALTH_TONE: Record<ScheduleHealth, string> = {
  complete: 'bg-success/15 text-success',
  on_track: 'bg-success/15 text-success',
  at_risk: 'bg-warning/20 text-warning-foreground',
  behind: 'bg-destructive/10 text-destructive',
  not_scheduled: 'bg-muted text-muted-foreground',
  empty: 'bg-muted text-muted-foreground',
}

const SEGMENT_TONE: Record<PhaseState, string> = {
  complete: 'bg-primary',
  in_progress: 'bg-primary/60',
  delayed: 'bg-destructive',
  upcoming: 'bg-muted',
  needs_dates: 'bg-muted',
}

function range(start: string | null, end: string | null) {
  if (!start && !end) return 'No dates'
  if (start === end || !end) return formatDate(start)
  if (!start) return `Ends ${formatDate(end)}`
  return `${formatDate(start)} – ${formatDate(end)}`
}

/** Phase-level summary derived from the live schedule; the detailed schedule stays authoritative. */
export function JobTimeline({ projectId, timeline }: { projectId: string; timeline: Timeline }) {
  if (timeline.health === 'empty') return null
  const upcomingMilestones = timeline.milestones.filter((m) => m.status !== 'completed' && m.status !== 'skipped').slice(0, 3)

  return (
    <section aria-labelledby="job-timeline-heading" className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h2 id="job-timeline-heading" className="text-base font-semibold text-foreground">
            Job timeline
          </h2>
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', HEALTH_TONE[timeline.health])}>
            {HEALTH_LABELS[timeline.health]}
          </span>
        </div>
        <Link href={`/projects/${projectId}/schedule`} className="text-sm font-medium text-primary hover:underline">
          Open schedule
        </Link>
      </div>

      <div className="flex h-2 gap-1 overflow-hidden rounded-full" aria-hidden="true">
        {timeline.phases.map((p) => (
          <div key={p.key} className={cn('h-full flex-1 rounded-full', SEGMENT_TONE[p.state])} style={{ flexGrow: Math.max(p.total, 1) }} />
        ))}
      </div>

      <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {timeline.phases.map((p) => (
          <li
            key={p.key}
            className={cn('flex flex-col gap-0.5 rounded-lg border px-3 py-2', p.isCurrent && 'border-primary/50 bg-primary/5')}
            aria-current={p.isCurrent ? 'step' : undefined}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium text-foreground">{p.name}</span>
              <span className={cn('shrink-0 text-xs', p.state === 'delayed' ? 'text-destructive' : 'text-muted-foreground')}>
                {PHASE_STATE_LABELS[p.state]}
              </span>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {`${p.completed}/${p.total} done · ${range(p.start, p.end)}`}
            </span>
          </li>
        ))}
      </ol>

      <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">Forecast finish</dt>
          <dd className="font-medium text-foreground">{timeline.forecastEnd ? formatDate(timeline.forecastEnd) : 'Not scheduled'}</dd>
        </div>
        {timeline.overdueCount > 0 && (
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Overdue</dt>
            <dd className="font-medium text-destructive">{timeline.overdueCount}</dd>
          </div>
        )}
        {timeline.undatedCount > 0 && (
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Need dates</dt>
            <dd className="font-medium text-foreground">{timeline.undatedCount}</dd>
          </div>
        )}
      </dl>

      {upcomingMilestones.length > 0 && (
        <ul className="flex flex-col gap-1.5 border-t pt-3" aria-label="Upcoming milestones">
          {upcomingMilestones.map((m) => (
            <li key={m.id} className="flex items-center gap-2 text-sm">
              <Flag className={cn('size-3.5 shrink-0', m.overdue ? 'text-destructive' : 'text-primary')} aria-hidden="true" />
              <span className="truncate text-foreground">{m.name}</span>
              <span className={cn('ml-auto shrink-0 text-xs tabular-nums', m.overdue ? 'text-destructive' : 'text-muted-foreground')}>
                {m.date ? formatDate(m.date) : 'No date'}
                {m.overdue && <span className="sr-only"> (overdue)</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
