import { HardHat } from 'lucide-react'
import type { ActivityAssignment, AssignmentAvailability } from '@/lib/assignments'
import type { ScheduleActivity } from '@/lib/schedule'
import { ACTIVITY_STATUS_LABELS } from '@/lib/schedule'
import { formatDate } from '@/lib/format'
import { SECTION_CARD_CLASS, SectionCardHeader } from '@/components/schedule/schedule-section-header'
import { SectionDisclosure } from '@/components/schedule/schedule-section-card'

/** Read-only overview of who is assigned to what on this project. Editing happens in the activity sheet. */
export function ProjectAssignmentsCard({
  availability,
  assignments,
  activities,
}: {
  availability: AssignmentAvailability
  assignments: ActivityAssignment[]
  activities: ScheduleActivity[]
}) {
  const byId = new Map(activities.map((a) => [a.id, a]))
  const ordered = [...assignments].sort((a, b) => {
    const pa = byId.get(a.schedule_activity_id)?.planned_start ?? '9999'
    const pb = byId.get(b.schedule_activity_id)?.planned_start ?? '9999'
    return pa.localeCompare(pb)
  })

  return (
    <section aria-labelledby="assignments-heading" className={SECTION_CARD_CLASS}>
      <SectionCardHeader
        icon={HardHat}
        title="Subcontractor assignments"
        titleId="assignments-heading"
        description="Open an activity to assign, reassign, or revoke work"
        aside={
          availability === 'ready' && (
            <span className="text-sm tabular-nums text-muted-foreground">
              {`${assignments.length} active ${assignments.length === 1 ? 'assignment' : 'assignments'}`}
            </span>
          )
        }
      />

      {availability === 'setup-required' ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">
          Assignments are not set up in this environment yet. An administrator needs to apply the assignments database migration.
          Nothing else on the schedule is affected.
        </p>
      ) : availability === 'error' ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">Assignments could not be loaded. Refresh the page to try again.</p>
      ) : ordered.length === 0 ? (
        <SectionDisclosure
          expandLabel="Show"
          preferenceKey="assignments-empty"
          summary={<span className="font-medium text-brand-deep">No active assignments</span>}
        >
          <p className="text-sm text-muted-foreground">Select an activity on the chart to assign work to a subcontractor.</p>
        </SectionDisclosure>
      ) : (
        <SectionDisclosure
          expandLabel="Show"
          defaultOpen
          preferenceKey="assignments"
          summary={
            <span className="block truncate">
              {ordered
                .slice(0, 3)
                .map((a) => a.company_name)
                .join(', ')}
              {ordered.length > 3 ? ` and ${ordered.length - 3} more` : ''}
            </span>
          }
        >
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
          {ordered.map((a) => {
            const act = byId.get(a.schedule_activity_id)
            return (
              <li key={a.id} className="flex min-w-0 flex-col gap-1 rounded-md border border-border bg-[#F8F7F3] p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-brand-deep">{a.company_name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{a.company_trade}</span>
                </div>
                <span className="truncate text-sm text-foreground/80">{act?.name ?? 'Removed activity'}</span>
                <span className="text-xs text-muted-foreground">
                  {act
                    ? `${ACTIVITY_STATUS_LABELS[act.status]} · ${act.planned_start ? `${formatDate(act.planned_start)} – ${formatDate(act.planned_end)}` : 'No planned dates'}`
                    : ''}
                </span>
                <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{a.scope_of_work}</p>
              </li>
            )
          })}
        </ul>
        </SectionDisclosure>
      )}
    </section>
  )
}
