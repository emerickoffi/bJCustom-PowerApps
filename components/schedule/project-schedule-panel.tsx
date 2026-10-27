import Link from 'next/link'
import { CalendarRange, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'
import { ActivityStatusBadge } from '@/components/schedule/schedule-badges'
import { isOverdue, type ActivityStatus } from '@/lib/schedule'
import { formatDate } from '@/lib/format'

export async function ProjectSchedulePanel({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('schedule_activities')
    .select('id, name, status, planned_end, activity_type')
    .eq('project_id', projectId)
    .neq('status', 'skipped')
    .order('sort_order')
  const activities = (data ?? []) as { id: string; name: string; status: ActivityStatus; planned_end: string | null; activity_type: string }[]
  const completed = activities.filter((a) => a.status === 'completed').length
  const late = activities.filter((a) => a.status === 'delayed' || isOverdue(a)).length
  const next = activities.filter((a) => a.status !== 'completed').slice(0, 3)

  return (
    <section aria-labelledby="schedule-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="schedule-heading" className="font-serif text-lg font-semibold text-foreground">
          Schedule
        </h2>
        <Button variant="outline" render={<Link href={`/projects/${projectId}/schedule`} />} nativeButton={false}>
          <CalendarRange data-icon="inline-start" />
          {activities.length ? 'Open schedule' : canManage ? 'Set up schedule' : 'View schedule'}
        </Button>
      </div>
      {activities.length ? (
        <div className="flex flex-col rounded-xl border bg-card">
          <p className="border-b px-4 py-3 text-sm text-muted-foreground">
            {`${completed} of ${activities.length} activities complete${late ? ` · ${late} delayed or past due` : ''}`}
          </p>
          <ul className="flex flex-col divide-y">
            {next.map((a) => (
              <li key={a.id}>
                <Link href={`/projects/${projectId}/schedule`} className="flex items-center justify-between gap-3 p-4 hover:bg-muted">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium text-foreground">{a.name}</span>
                    <span className="text-xs text-muted-foreground">{a.planned_end ? `Due ${formatDate(a.planned_end)}` : 'Not scheduled'}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <ActivityStatusBadge status={a.status} />
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-dashed bg-card p-4 text-sm text-muted-foreground">
          <CalendarRange className="size-5 shrink-0" aria-hidden="true" />
          No schedule yet. Apply the standard build template to start tracking milestones.
        </div>
      )}
    </section>
  )
}
