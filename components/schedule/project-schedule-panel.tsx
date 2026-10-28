import Link from 'next/link'
import { CalendarDays, CalendarRange, ChevronRight, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'
import { ActivityStatusBadge } from '@/components/schedule/schedule-badges'
import { OverviewNotice, OverviewSection } from '@/components/projects/overview-section'
import { isOverdue, type ActivityStatus } from '@/lib/schedule'
import { formatDate } from '@/lib/format'

type Activity = {
  id: string
  name: string
  status: ActivityStatus
  planned_start: string | null
  planned_end: string | null
  activity_type: string
}

export async function ProjectSchedulePanel({
  projectId,
  canManage,
  progressPercent,
}: {
  projectId: string
  canManage: boolean
  progressPercent: number | null
}) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('schedule_activities')
    .select('id, name, status, planned_start, planned_end, activity_type')
    .eq('project_id', projectId)
    .neq('status', 'skipped')
    .order('sort_order')
  const activities = (data ?? []) as Activity[]
  const completed = activities.filter((a) => a.status === 'completed').length
  const late = activities.filter((a) => a.status === 'delayed' || isOverdue(a)).length
  const open = activities.filter((a) => a.status !== 'completed')
  const next = [...open.filter((a) => a.status === 'in_progress'), ...open.filter((a) => a.status !== 'in_progress')].slice(0, 3)
  const anyScheduled = activities.some((a) => a.planned_start || a.planned_end)
  const scheduleHref = `/projects/${projectId}/schedule`

  return (
    <OverviewSection
      id="schedule-heading"
      icon={CalendarDays}
      title="Construction schedule"
      subtitle={activities.length ? 'Upcoming and in-progress construction activities.' : 'Milestones and construction activities.'}
      meta={
        activities.length ? (
          <span className="rounded-full bg-sage px-2 py-0.5 text-xs font-medium tabular-nums text-primary">
            {`${completed} / ${activities.length} complete`}
          </span>
        ) : null
      }
      actions={
        <Button variant="outline" render={<Link href={scheduleHref} />} nativeButton={false}>
          <CalendarRange data-icon="inline-start" />
          {activities.length ? 'Open schedule' : canManage ? 'Set up schedule' : 'View schedule'}
        </Button>
      }
    >
      {activities.length ? (
        <>
          {progressPercent !== null && (
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Construction progress</span>
                <span className="font-semibold tabular-nums text-foreground">{`${Math.round(progressPercent)}%`}</span>
              </div>
              <div
                className="h-1.5 overflow-hidden rounded-full bg-sage"
                role="progressbar"
                aria-label="Construction progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progressPercent)}
              >
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }} />
              </div>
              {late > 0 && <p className="text-xs text-warning">{`${late} delayed or past due`}</p>}
            </div>
          )}

          {!anyScheduled && (
            <OverviewNotice
              icon={Info}
              title="Schedule setup needed"
              body="Add planned dates to begin tracking upcoming construction milestones."
            />
          )}

          {next.length > 0 ? (
            <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
              {next.map((a) => (
                <li key={a.id}>
                  <Link href={scheduleHref} className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[#F8F7F3]">
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium text-foreground">{a.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {a.planned_end ? `Due ${formatDate(a.planned_end)}` : a.planned_start ? `Starts ${formatDate(a.planned_start)}` : 'Not scheduled'}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <ActivityStatusBadge status={a.status} />
                      <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">All schedule activities are complete.</p>
          )}
        </>
      ) : (
        <OverviewNotice
          icon={CalendarRange}
          title="No schedule yet"
          body="Apply the standard build template to start tracking milestones."
        />
      )}
    </OverviewSection>
  )
}
