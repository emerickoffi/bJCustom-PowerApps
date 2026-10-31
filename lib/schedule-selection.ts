export const ALL_PROJECTS = 'all'

export type ScheduleSelection =
  | { kind: 'none' }
  | { kind: 'all' }
  | { kind: 'project'; projectId: string }
  | { kind: 'unavailable'; requestedId: string }

/**
 * Resolves the Schedule workspace selection from the URL. Never falls back to
 * another project: an unknown, deleted, or unauthorized id yields `unavailable`.
 * `project` is the legacy query key and is honored only when `projectId` is absent.
 */
export function resolveScheduleSelection(
  params: { projectId?: string | string[]; project?: string | string[] },
  authorizedProjectIds: Iterable<string>,
): ScheduleSelection {
  const raw = params.projectId ?? params.project
  const requested = (Array.isArray(raw) ? raw[0] : raw)?.trim()
  if (!requested) return { kind: 'none' }
  if (requested === ALL_PROJECTS) return { kind: 'all' }
  for (const id of authorizedProjectIds) {
    if (id === requested) return { kind: 'project', projectId: id }
  }
  return { kind: 'unavailable', requestedId: requested }
}

export function scheduleHref(projectId: string) {
  return `/schedule?projectId=${encodeURIComponent(projectId)}`
}
