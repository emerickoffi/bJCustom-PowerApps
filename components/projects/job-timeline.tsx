import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format'
import { PHASE_STATE_LABELS, type JobTimeline as Timeline, type PhaseState } from '@/lib/job-timeline'

const SEGMENT_TONE: Record<PhaseState, string> = {
  complete: 'bg-primary',
  in_progress: 'bg-primary/60',
  delayed: 'bg-destructive',
  upcoming: 'bg-muted',
  needs_dates: 'bg-muted',
}

/**
 * Compact phase strip shown inside the overview Schedule card. Counts, overdue work, and the next
 * activity already live in that card, so this only adds where the job is across its phases.
 */
export function JobTimeline({ timeline }: { timeline: Timeline }) {
  if (timeline.phases.length < 2) return null
  const current = timeline.phases.find((p) => p.isCurrent) ?? null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-2 gap-1 overflow-hidden rounded-full" aria-hidden="true">
        {timeline.phases.map((p) => (
          <div
            key={p.key}
            className={cn('h-full rounded-full', SEGMENT_TONE[p.state], p.isCurrent && 'ring-2 ring-primary/30')}
            style={{ flexGrow: Math.max(p.total, 1), flexBasis: 0 }}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          {current ? (
            <>
              {'Phase: '}
              <span className="font-medium text-foreground">{current.name}</span>
              {` · ${current.completed}/${current.total} done`}
            </>
          ) : (
            'All phases complete'
          )}
        </span>
        {timeline.forecastEnd && <span className="tabular-nums">{`Forecast finish ${formatDate(timeline.forecastEnd)}`}</span>}
      </div>
      <details className="group text-xs">
        <summary className="cursor-pointer text-primary hover:underline">{`All phases (${timeline.phases.length})`}</summary>
        <ol className="mt-2 flex flex-col gap-1">
          {timeline.phases.map((p) => (
            <li key={p.key} className="flex items-center justify-between gap-2" aria-current={p.isCurrent ? 'step' : undefined}>
              <span className={cn('truncate', p.isCurrent ? 'font-medium text-foreground' : 'text-foreground')}>{p.name}</span>
              <span className={cn('shrink-0 tabular-nums', p.state === 'delayed' ? 'text-destructive' : 'text-muted-foreground')}>
                {`${PHASE_STATE_LABELS[p.state]} · ${p.completed}/${p.total}`}
              </span>
            </li>
          ))}
        </ol>
      </details>
    </div>
  )
}
