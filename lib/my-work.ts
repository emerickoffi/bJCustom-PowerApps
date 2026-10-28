import { isOverdue, type ActivityStatus } from './schedule.ts'

type ActivityLike = { status: ActivityStatus; planned_end: string | null }

/** Splits a user's open assigned activities into items needing attention (delayed or past planned finish) and the rest. */
export function splitAssignedActivities<T extends ActivityLike>(rows: T[], today: string): { attention: T[]; upcoming: T[] } {
  const attention: T[] = []
  const upcoming: T[] = []
  for (const row of rows) {
    if (row.status === 'completed' || row.status === 'skipped') continue
    if (row.status === 'delayed' || isOverdue(row, today)) attention.push(row)
    else upcoming.push(row)
  }
  return { attention, upcoming }
}

/** PostgREST `or` filter for projects the user manages or is a member of. Inputs are database UUIDs. */
export function assignedProjectsFilter(userId: string, memberProjectIds: string[]): string {
  return memberProjectIds.length
    ? `project_manager_id.eq.${userId},id.in.(${memberProjectIds.join(',')})`
    : `project_manager_id.eq.${userId}`
}
