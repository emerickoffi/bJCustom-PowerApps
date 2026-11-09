import Link from 'next/link'
import { CalendarDays, CalendarRange, ChevronRight, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'
import { ActivityStatusBadge } from '@/components/schedule/schedule-badges'
import { OverviewNotice, OverviewSection } from '@/components/projects/overview-section'
import { isOverdue, type ActivityStatus } from '@/lib/schedule'
import { formatDate } from '@/lib/format'

export const PROGRESS_WEIGHTING_NOTE =
  'Progress is weighted by each activity’s size and percent complete, so it can differ from the activity count.'

type Activity = {
  id: string
  name: string
  status: ActivityStatus
  planned_start: string | null
  planned_end: string | null
  actual_end: string | null
  activity_type: string
}

const MILESTONE_LIMIT = 5

function MilestoneActual({ a }: { a: Activity }) {
  if (a.actual_end) return <span className="text-foreground">{formatDate(a.actual_end)}</span>
  if (a.status === 'completed') return <span className="text-muted-foreground">Completed · date not recorded</span>
  return <span className="text-muted-foreground">Not reached</span>
}

/** Weighted progress lives in the project header; this panel lists activities and milestones only. */
export async function ProjectSchedulePanel({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('schedule_activities')
    .select('id, name, status, planned_start, planned_end, actual_end, activity_type')
    .eq('project_id', projectId)
    .neq('status', 'skipped')
    .order('sort_order')
  const scheduleHref = `/projects/${projectId}/schedule`
  if (error) {
    return (
      <OverviewSection
        id="schedule-heading"
        icon={CalendarDays}
        title="Construction schedule"
        actions={
          <Button variant="outline" render={<Link href={scheduleHref} />} nativeButton={false}>
            <CalendarRange data-icon="inline-start" />
            Open schedule
          </Button>
        }
      >
        <p role="status" className="text-sm text-warning">
          Schedule activities could not be loaded. Refresh the page or open the full schedule.
        </p>
      </OverviewSection>
    )
  }
  const activities = (data ?? []) as Activity[]
  const completed = activities.filter((a) => a.status === 'completed').length
  const isLate = (a: Activity) => a.status !== 'completed' && (a.status === 'delayed' || isOverdue(a))
  const late = activities.filter(isLate).length
  const open = activities.filter((a) => a.status !== 'completed')
  const next = [
    ...open.filter(isLate),
    ...open.filter((a) => !isLate(a) && a.status === 'in_progress'),
    ...open.filter((a) => !isLate(a) && a.status !== 'in_progress'),
  ].slice(0, 3)
  const anyScheduled = activities.some((a) => a.planned_start || a.planned_end)
  const milestones = activities.filter((a) => a.activity_type === 'milestone')
  const shownMilestones = milestones.slice(0, MILESTONE_LIMIT)

  return (
    <OverviewSection
      id="schedule-heading"
      icon={CalendarDays}
      title="Construction schedule"
      subtitle={activities.length ? 'Overdue, in-progress, and upcoming activities.' : 'Milestones and construction activities.'}
      meta={
        activities.length ? (
          <span className="rounded-badge bg-sage px-2 py-0.5 text-xs font-medium tabular-nums text-primary">
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
          {late > 0 && (
            <p className="text-xs font-medium text-warning">{`${late} ${late === 1 ? 'activity is' : 'activities are'} delayed or past the planned finish`}</p>
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
                      <span className={isOverdue(a) ? 'text-xs font-medium text-warning' : 'text-xs text-muted-foreground'}>
                        {a.planned_end
                          ? `${isOverdue(a) ? 'Past due · planned finish' : 'Due'} ${formatDate(a.planned_end)}`
                          : a.planned_start
                            ? `Starts ${formatDate(a.planned_start)}`
                            : 'Not scheduled'}
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

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">Milestones</h3>
              {milestones.length > MILESTONE_LIMIT && (
                <Link href={scheduleHref} className="text-xs font-medium text-primary underline-offset-4 hover:underline">
                  {`View all ${milestones.length}`}
                </Link>
              )}
            </div>
            {shownMilestones.length ? (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#F8F7F3] text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-4 py-2 font-medium">Milestone</th>
                      <th scope="col" className="whitespace-nowrap px-4 py-2 font-medium">Planned</th>
                      <th scope="col" className="whitespace-nowrap px-4 py-2 font-medium">Actual</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {shownMilestones.map((m) => (
                      <tr key={m.id}>
                        <th scope="row" className="max-w-[16rem] truncate px-4 py-2.5 font-medium text-foreground">{m.name}</th>
                        <td className={isOverdue(m) ? 'whitespace-nowrap px-4 py-2.5 font-medium text-warning' : 'whitespace-nowrap px-4 py-2.5 text-foreground'}>
                          {m.planned_end ? formatDate(m.planned_end) : <span className="text-muted-foreground">Not planned</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5">
                          <MilestoneActual a={m} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No milestone activities in this schedule.</p>
            )}
          </div>
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
