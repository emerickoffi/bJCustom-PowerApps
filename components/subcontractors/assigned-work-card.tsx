import Link from 'next/link'
import { ChevronDown, ClipboardList } from 'lucide-react'
import type { AssignmentAvailability } from '@/lib/assignments'
import type { CompanyWorkItem } from '@/lib/assignments-data'
import { ACTIVITY_STATUS_LABELS, type ScheduleActivity } from '@/lib/schedule'
import { formatDate } from '@/lib/format'

/** Active assigned work grouped by company. Read-only; assignments are edited from the project schedule. */
export function AssignedWorkCard({ availability, items }: { availability: AssignmentAvailability; items: CompanyWorkItem[] }) {
  const groups = new Map<string, { name: string; trade: string; items: CompanyWorkItem[] }>()
  for (const item of items) {
    const g = groups.get(item.subcontractor_company_id) ?? { name: item.company_name, trade: item.company_trade, items: [] }
    g.items.push(item)
    groups.set(item.subcontractor_company_id, g)
  }
  const ordered = [...groups.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name))

  if (availability === 'ready' && ordered.length === 0) {
    return (
      <section
        aria-labelledby="assigned-work-heading"
        className="flex flex-col gap-1 rounded-xl border border-dashed border-border/80 px-4 py-3 text-sm sm:flex-row sm:items-center sm:gap-3"
      >
        <h2 id="assigned-work-heading" className="flex items-center gap-2 font-medium text-foreground">
          <ClipboardList className="size-4 text-muted-foreground" aria-hidden="true" />
          Assigned work
        </h2>
        <p className="text-muted-foreground">No active schedule assignments. Assign work from a project schedule.</p>
      </section>
    )
  }

  const activityCount = ordered.reduce((n, [, g]) => n + g.items.length, 0)
  return (
    <details aria-labelledby="assigned-work-heading" className="group rounded-xl border bg-card [&[open]]:pb-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-5 py-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
          <h2 id="assigned-work-heading" className="flex items-center gap-2 font-serif text-base font-semibold text-foreground">
            <ClipboardList className="size-4 text-primary" aria-hidden="true" />
            Assigned work
          </h2>
          <span className="text-sm text-muted-foreground">
            {availability === 'ready'
              ? `${activityCount} active ${activityCount === 1 ? 'activity' : 'activities'} across ${ordered.length} ${ordered.length === 1 ? 'company' : 'companies'}`
              : availability === 'setup-required'
                ? 'Not set up yet'
                : 'Could not be loaded'}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="flex flex-col gap-4 px-5">
        <p className="text-sm text-muted-foreground">Active schedule assignments across your projects. Assign work from a project schedule.</p>
      {availability === 'setup-required' ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Assignments are not set up in this environment yet. The directory above is unaffected.
        </p>
      ) : availability === 'error' ? (
        <p className="text-sm text-muted-foreground">Assigned work could not be loaded. Refresh the page to try again.</p>
      ) : ordered.length === 0 ? (
        <p className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">No subcontractor has active assigned work.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {ordered.map(([companyId, g]) => (
            <li key={companyId} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">{g.name}</span>
                <span className="text-xs text-muted-foreground">{`${g.trade} · ${g.items.length} ${g.items.length === 1 ? 'activity' : 'activities'}`}</span>
              </div>
              <ul className="flex flex-col divide-y rounded-lg border">
                {g.items.map((item) => (
                  <li key={item.id} className="flex flex-col gap-0.5 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <Link
                        href={`/projects/${item.project_id}/schedule`}
                        className="truncate text-sm font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {`${item.project_name} · ${item.activity_name}`}
                      </Link>
                      <span className="line-clamp-1 text-xs text-muted-foreground">{item.scope_of_work}</span>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {`${ACTIVITY_STATUS_LABELS[item.activity_status as ScheduleActivity['status']] ?? 'Not started'} · ${
                        item.planned_start ? `${formatDate(item.planned_start)} – ${formatDate(item.planned_end)}` : 'No dates'
                      }`}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      </div>
    </details>
  )
}
