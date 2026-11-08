import Link from 'next/link'
import { CalendarDays, CalendarRange } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ActivityStatusBadge } from '@/components/schedule/schedule-badges'
import { isOverdue, type ActivityStatus } from '@/lib/schedule'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

export type SnapshotActivity = {
  id: string
  name: string
  status: ActivityStatus
  planned_start: string | null
  planned_end: string | null
  activity_type: string
}

function plannedLabel(a: SnapshotActivity) {
  if (a.planned_start && a.planned_end && a.planned_start !== a.planned_end) return `${formatDate(a.planned_start)} – ${formatDate(a.planned_end)}`
  if (a.planned_end) return `Planned ${formatDate(a.planned_end)}`
  return `Starts ${formatDate(a.planned_start)}`
}

function Stat({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-[#F8F9FA] px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('text-sm font-semibold tabular-nums', danger ? 'text-destructive' : 'text-foreground')}>{value}</dd>
    </div>
  )
}

/** Only dated activities are treated as scheduled or overdue; undated work is reported as needing dates. */
export function ProjectScheduleSnapshot({
  projectId,
  activities,
  loadError,
  progress,
}: {
  projectId: string
  activities: SnapshotActivity[]
  loadError: boolean
  progress: number | null
}) {
  const scheduleHref = `/projects/${projectId}/schedule`
  const counted = activities.filter((a) => a.status !== 'skipped')
  const open = counted.filter((a) => a.status !== 'completed')
  const dated = open
    .filter((a) => a.planned_start || a.planned_end)
    .sort((a, b) => (a.planned_start ?? a.planned_end ?? '').localeCompare(b.planned_start ?? b.planned_end ?? ''))
  const next = dated[0]
  const undated = open.length - dated.length
  const late = open.filter((a) => a.status === 'delayed' || isOverdue(a)).length
  const completed = counted.length - open.length

  return (
    <section aria-labelledby="schedule-snapshot-heading" className="surface flex min-w-0 flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-3">
        <h2 id="schedule-snapshot-heading" className="flex items-center gap-2 font-serif text-lg font-semibold text-foreground">
          <CalendarDays className="size-4 text-primary" aria-hidden="true" />
          Schedule
        </h2>
        <Button variant="outline" size="sm" render={<Link href={scheduleHref} />} nativeButton={false}>
          <CalendarRange data-icon="inline-start" />
          Open schedule
        </Button>
      </header>

      {loadError ? (
        <p role="status" className="text-sm text-warning">
          Schedule activities could not be loaded. Refresh the page or open the full schedule.
        </p>
      ) : counted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No schedule activities yet. Open the schedule to set it up.</p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5 rounded-xl border border-[#D6DDE5] p-3">
            {next ? (
              <>
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {next.activity_type === 'milestone' ? 'Next milestone' : 'Next activity'}
                </span>
                <span className="break-words text-sm font-semibold text-foreground">{next.name}</span>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{plannedLabel(next)}</span>
                  <ActivityStatusBadge status={next.status} />
                </div>
              </>
            ) : open.length === 0 ? (
              <span className="text-sm font-semibold text-foreground">All activities complete</span>
            ) : (
              <>
                <span className="text-sm font-semibold text-foreground">Schedule dates needed</span>
                <span className="text-xs text-muted-foreground">Add planned dates in the schedule to see what’s next.</span>
              </>
            )}
          </div>
          <dl className="grid grid-cols-3 gap-2">
            <Stat label="Progress" value={progress === null ? 'Not set' : `${Math.round(progress)}%`} />
            <Stat label="Complete" value={`${completed} of ${counted.length}`} />
            <Stat label="Overdue or delayed" value={String(late)} danger={late > 0} />
          </dl>
          {next && undated > 0 && (
            <p className="text-xs text-muted-foreground">
              {`${undated} open ${undated === 1 ? 'activity has' : 'activities have'} no planned dates.`}
            </p>
          )}
        </>
      )}
    </section>
  )
}
