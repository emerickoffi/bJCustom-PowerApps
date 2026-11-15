import Link from 'next/link'
import { AlertTriangle, ChevronDown, CircleHelp } from 'lucide-react'
import { formatDate } from '@/lib/format'
import {
  RESOURCE_TYPE_LABELS,
  projectsInvolved,
  type ConflictSide,
  type ResourceConflict,
  type ResourceType,
} from '@/lib/resource-conflicts'
import type { ResourceConflictLoad } from '@/lib/resource-conflicts-data'

const MAX_LISTED = 50

export const activityHref = (projectId: string, activityId: string) => `/projects/${projectId}/schedule?activity=${activityId}`

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function checkedLabel(checked: ResourceType[]): string {
  if (checked.length === 2) return 'Checked subcontractor assignments and staff assignees.'
  return checked[0] === 'staff' ? 'Checked staff assignees only.' : 'Checked subcontractor assignments only.'
}

export function dateRange(start: string, end: string) {
  return start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`
}

function Side({ side }: { side: ConflictSide }) {
  if (!side.visible) {
    return <span className="text-muted-foreground">Another project you don&apos;t have access to</span>
  }
  return (
    <span className="flex min-w-0 flex-col">
      <Link
        href={activityHref(side.projectId, side.activityId)}
        className="w-fit break-words font-medium text-primary underline-offset-2 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {`${side.projectName} · ${side.activityName}`}
      </Link>
      <span className="text-xs tabular-nums text-muted-foreground">{dateRange(side.start, side.end)}</span>
    </span>
  )
}

function ConflictItem({ conflict }: { conflict: ResourceConflict }) {
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-semibold text-foreground">{conflict.resource.name}</span>
        <span className="rounded border border-warning/40 px-1.5 py-0.5 text-[11px] font-medium text-warning-foreground">
          {RESOURCE_TYPE_LABELS[conflict.resource.type]}
        </span>
        {conflict.overlap && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {`Overlap ${dateRange(conflict.overlap.start, conflict.overlap.end)} · ${plural(conflict.overlap.days, 'day')}`}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Side side={conflict.first} />
        <Side side={conflict.second} />
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{conflict.explanation}</p>
    </li>
  )
}

/** Compact, read-only summary of potential cross-project resource conflicts. Renders nothing when there is nothing to say. */
export function ResourceConflictsPanel({ load, scope }: { load: ResourceConflictLoad; scope: 'all' | 'project' }) {
  if (load.status === 'error') {
    return (
      <p role="status" className="flex items-start gap-2 rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground">
        <CircleHelp className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Resource conflicts across projects couldn&apos;t be checked right now. Refresh the page to try again.
      </p>
    )
  }
  const { conflicts, cannotAssess } = load.result
  const incomplete = load.status === 'incomplete'
  if (load.checked.length === 0 || (!conflicts.length && !cannotAssess.length && !incomplete)) return null

  const projectCount = projectsInvolved(conflicts)
  const headline = conflicts.length
    ? `${plural(conflicts.length, 'potential resource conflict')} ${scope === 'all' ? `across ${plural(projectCount, 'project')}` : 'with other projects'}`
    : incomplete
      ? 'Resource conflict check is incomplete'
      : `${plural(cannotAssess.length, 'assigned activity', 'assigned activities')} can't be checked for conflicts`

  return (
    <details className="group rounded-xl border border-warning/40 bg-warning/10 text-sm" role="region" aria-label="Potential resource conflicts">
      <summary className="flex cursor-pointer list-none items-start gap-3 rounded-xl p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground" aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-semibold text-foreground">{`${headline}.`}</span>
          <span className="text-xs text-muted-foreground">
            {[
              conflicts.length && cannotAssess.length ? `${plural(cannotAssess.length, 'activity', 'activities')} can't be assessed.` : null,
              incomplete ? 'Not every record could be checked, so other overlaps may exist.' : null,
              checkedLabel(load.checked),
              'Nothing is changed automatically.',
            ]
              .filter(Boolean)
              .join(' ')}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
          <span className="group-open:hidden">Review</span>
          <span className="hidden group-open:inline">Hide</span>
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
        </span>
      </summary>

      <div className="flex flex-col gap-3 border-t border-warning/30 bg-card px-3 pb-3 sm:px-4">
        {conflicts.length > 0 && (
          <ul className="flex flex-col divide-y">
            {conflicts.slice(0, MAX_LISTED).map((c) => (
              <ConflictItem key={c.id} conflict={c} />
            ))}
            {conflicts.length > MAX_LISTED && (
              <li className="py-3 text-xs text-muted-foreground">{`and ${conflicts.length - MAX_LISTED} more`}</li>
            )}
          </ul>
        )}
        {cannotAssess.length > 0 && (
          <section className="flex flex-col gap-2 pt-3">
            <h3 className="text-xs font-semibold text-foreground">Cannot assess</h3>
            <p className="text-xs text-muted-foreground">
              These activities share a resource with another project but are missing usable planned dates, so overlaps can&apos;t be ruled out.
            </p>
            <ul className="flex flex-col gap-1.5">
              {cannotAssess.slice(0, MAX_LISTED).map((u) => (
                <li key={u.id} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                  <Link
                    href={activityHref(u.projectId, u.activityId)}
                    className="font-medium text-primary underline-offset-2 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {`${u.projectName} · ${u.activityName}`}
                  </Link>
                  <span className="text-muted-foreground">{`${u.resource.name} (${RESOURCE_TYPE_LABELS[u.resource.type]}) · ${u.reason}`}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </details>
  )
}
