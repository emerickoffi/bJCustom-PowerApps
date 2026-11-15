'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { AlertTriangle } from 'lucide-react'
import { checkProposedAssignmentAction } from '@/app/actions/resource-conflicts'
import type { ResourceType } from '@/lib/resource-conflicts'
import { formatDate } from '@/lib/format'

const range = (start: string, end: string) => (start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`)

/**
 * Non-blocking warning for a proposed assignment. Keyed on the exact selection and the activity's last update, so a
 * changed selection or saved date change never shows a previous result; the server re-reads current data each time.
 */
export function AssignmentConflictWarning({
  projectId,
  activityId,
  activityVersion,
  type,
  resourceId,
  replacesAssignmentId,
}: {
  projectId: string
  activityId: string
  activityVersion: string
  type: ResourceType
  resourceId: string | null | undefined
  replacesAssignmentId?: string
}) {
  const key = resourceId ? ['assignment-conflicts', projectId, activityId, activityVersion, type, resourceId, replacesAssignmentId ?? ''] : null
  const { data, error, isLoading } = useSWR(
    key,
    () => checkProposedAssignmentAction({ projectId, activityId, type, resourceId: resourceId!, replacesAssignmentId }),
    { revalidateOnFocus: true, shouldRetryOnError: false, dedupingInterval: 2000 },
  )

  if (!key) return null
  if (isLoading) {
    return (
      <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
        Checking other projects for overlapping work...
      </p>
    )
  }
  if (error || !data || data.status === 'error') {
    return (
      <p role="status" className="text-xs text-muted-foreground">
        Overlaps with other projects couldn&apos;t be checked. You can still save.
      </p>
    )
  }
  if (data.status === 'unavailable') return null
  if (data.status === 'undated') {
    return <p className="text-xs text-muted-foreground">{data.message}</p>
  }

  const { conflicts } = data
  const incomplete = data.status === 'incomplete'
  if (!conflicts.length) {
    return incomplete ? (
      <p role="status" className="text-xs text-muted-foreground">
        Not every project could be checked for overlapping work, so overlaps may exist.
      </p>
    ) : null
  }

  const who = conflicts[0].resource.name
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-foreground">
      <p className="flex items-start gap-2 font-medium">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning-foreground" aria-hidden="true" />
        {`Potential conflict: ${who} is also assigned to ${conflicts.length === 1 ? 'an activity' : `${conflicts.length} activities`} in other projects on overlapping dates.`}
      </p>
      <ul className="flex flex-col gap-1 pl-5">
        {conflicts.slice(0, 5).map((c) => {
          const other = c.first.visible && c.first.activityId === activityId ? c.second : c.first
          return (
            <li key={c.id}>
              {other.visible ? (
                <>
                  <Link
                    href={`/projects/${other.projectId}/schedule?activity=${other.activityId}`}
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    {`${other.projectName} · ${other.activityName}`}
                  </Link>
                  <span className="text-muted-foreground">
                    {` · ${range(other.start, other.end)}${c.overlap ? ` · overlap ${range(c.overlap.start, c.overlap.end)}` : ''}`}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">Work on another project you don&apos;t have access to</span>
              )}
            </li>
          )
        })}
        {conflicts.length > 5 && <li className="text-muted-foreground">{`and ${conflicts.length - 5} more`}</li>}
      </ul>
      <p className="text-muted-foreground">
        {`${incomplete ? 'Not every project could be checked. ' : ''}You can still save. Nothing is rescheduled or reassigned automatically.`}
      </p>
    </div>
  )
}
