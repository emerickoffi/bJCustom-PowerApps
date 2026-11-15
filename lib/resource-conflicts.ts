/**
 * Deterministic cross-project resource conflict detection. Read-only: nothing here changes schedules.
 *
 * A potential conflict is the same identifiable resource (a subcontractor company, or the staff member set as an
 * activity's assignee) on open activities in two different projects of one organization whose planned date ranges
 * overlap. Planned dates are inclusive date-only strings (YYYY-MM-DD), so string comparison is calendar comparison
 * and no time zone conversion is involved.
 */

export type ResourceType = 'subcontractor' | 'staff'
export type ResourceRef = { type: ResourceType; id: string; name: string }

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  subcontractor: 'Subcontractor',
  staff: 'Staff assignee',
}

/** Activity statuses that no longer occupy a resource. */
export const EXCLUDED_ACTIVITY_STATUSES: readonly string[] = ['completed', 'skipped']
/** Project statuses whose remaining activities are not going to be worked. */
export const EXCLUDED_PROJECT_STATUSES: readonly string[] = ['completed', 'cancelled']

export type ConflictProject = { id: string; name: string; organization_id: string; status: string }
export type ConflictActivity = {
  id: string
  project_id: string
  organization_id: string
  name: string
  status: string
  planned_start: string | null
  planned_end: string | null
  assigned_to: string | null
}
export type ConflictAssignment = {
  id: string
  organization_id: string
  project_id: string
  schedule_activity_id: string
  subcontractor_company_id: string
  company_name: string
}

export type DetectionInput = {
  organizationId: string
  projects: readonly ConflictProject[]
  activities: readonly ConflictActivity[]
  assignments: readonly ConflictAssignment[]
  staffNames: Readonly<Record<string, string>>
}

export type VisibleSide = {
  visible: true
  projectId: string
  projectName: string
  activityId: string
  activityName: string
  start: string
  end: string
}
/** The other project exists but the viewer cannot access it: nothing about it is exposed. */
export type HiddenSide = { visible: false }
export type ConflictSide = VisibleSide | HiddenSide

export type ResourceConflict = {
  id: string
  resource: ResourceRef
  first: ConflictSide
  second: ConflictSide
  /** Null when either side is hidden, because the overlap would reveal the hidden activity's dates. */
  overlap: { start: string; end: string; days: number } | null
  explanation: string
}

export type UnassessableItem = {
  id: string
  resource: ResourceRef
  projectId: string
  projectName: string
  activityId: string
  activityName: string
  reason: string
}

export type DetectionResult = { conflicts: ResourceConflict[]; cannotAssess: UnassessableItem[] }

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Inclusive day count between two ISO dates. */
export function inclusiveDays(start: string, end: string): number {
  const ms = Date.UTC(+end.slice(0, 4), +end.slice(5, 7) - 1, +end.slice(8, 10)) - Date.UTC(+start.slice(0, 4), +start.slice(5, 7) - 1, +start.slice(8, 10))
  return Math.round(ms / 86_400_000) + 1
}

function dateProblem(a: Pick<ConflictActivity, 'planned_start' | 'planned_end'>): string | null {
  const start = a.planned_start?.slice(0, 10) ?? null
  const end = a.planned_end?.slice(0, 10) ?? null
  if (!start && !end) return 'No planned start or finish date'
  if (!start) return 'No planned start date'
  if (!end) return 'No planned finish date'
  if (!ISO_DATE.test(start) || !ISO_DATE.test(end)) return 'Planned dates are not valid'
  if (start > end) return 'Planned finish is before planned start'
  return null
}

function explain(resource: ResourceRef): string {
  return resource.type === 'subcontractor'
    ? `${resource.name} is assigned to both activities on overlapping dates. Crews are not tracked individually, so this may be fine if the company can staff both jobs. Review with the subcontractor.`
    : `${resource.name} is the assignee on both activities on overlapping dates. Confirm they can cover both.`
}

type Entry = { activity: ConflictActivity; projectName: string; start: string; end: string; problem: string | null }

export function detectResourceConflicts(input: DetectionInput): DetectionResult {
  const org = input.organizationId
  const projects = new Map<string, ConflictProject>()
  for (const p of input.projects) {
    if (p.organization_id === org && !EXCLUDED_PROJECT_STATUSES.includes(p.status)) projects.set(p.id, p)
  }
  const activities = new Map<string, ConflictActivity>()
  for (const a of input.activities) {
    if (a.organization_id !== org || !projects.has(a.project_id) || EXCLUDED_ACTIVITY_STATUSES.includes(a.status)) continue
    activities.set(a.id, a)
  }

  const byResource = new Map<string, { resource: ResourceRef; entries: Map<string, Entry> }>()
  const add = (resource: ResourceRef, activity: ConflictActivity) => {
    const key = `${resource.type}:${resource.id}`
    let bucket = byResource.get(key)
    if (!bucket) byResource.set(key, (bucket = { resource, entries: new Map() }))
    if (bucket.entries.has(activity.id)) return
    const problem = dateProblem(activity)
    bucket.entries.set(activity.id, {
      activity,
      projectName: projects.get(activity.project_id)!.name,
      start: activity.planned_start?.slice(0, 10) ?? '',
      end: activity.planned_end?.slice(0, 10) ?? '',
      problem,
    })
  }

  for (const a of activities.values()) {
    if (a.assigned_to) add({ type: 'staff', id: a.assigned_to, name: input.staffNames[a.assigned_to] ?? 'Team member' }, a)
  }
  for (const s of input.assignments) {
    const activity = activities.get(s.schedule_activity_id)
    if (s.organization_id !== org || !activity || activity.project_id !== s.project_id) continue
    add({ type: 'subcontractor', id: s.subcontractor_company_id, name: s.company_name || 'Subcontractor' }, activity)
  }

  const conflicts: ResourceConflict[] = []
  const cannotAssess: UnassessableItem[] = []
  const side = (e: Entry): VisibleSide => ({
    visible: true,
    projectId: e.activity.project_id,
    projectName: e.projectName,
    activityId: e.activity.id,
    activityName: e.activity.name,
    start: e.start,
    end: e.end,
  })

  for (const { resource, entries } of byResource.values()) {
    const list = [...entries.values()]
    if (new Set(list.map((e) => e.activity.project_id)).size < 2) continue
    const dated: Entry[] = []
    for (const e of list) {
      if (e.problem) {
        cannotAssess.push({
          id: `${resource.type}:${resource.id}:${e.activity.id}`,
          resource,
          projectId: e.activity.project_id,
          projectName: e.projectName,
          activityId: e.activity.id,
          activityName: e.activity.name,
          reason: e.problem,
        })
      } else dated.push(e)
    }
    dated.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.activity.id < b.activity.id ? -1 : 1))
    for (let i = 0; i < dated.length; i++) {
      const a = dated[i]
      for (let j = i + 1; j < dated.length && dated[j].start <= a.end; j++) {
        const b = dated[j]
        if (a.activity.project_id === b.activity.project_id) continue
        const [first, second] = a.activity.id < b.activity.id ? [a, b] : [b, a]
        const start = b.start
        const end = a.end < b.end ? a.end : b.end
        conflicts.push({
          id: `${resource.type}:${resource.id}:${first.activity.id}:${second.activity.id}`,
          resource,
          first: side(first),
          second: side(second),
          overlap: { start, end, days: inclusiveDays(start, end) },
          explanation: explain(resource),
        })
      }
    }
  }

  conflicts.sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  cannotAssess.sort((a, b) => a.id.localeCompare(b.id))
  return { conflicts, cannotAssess }
}

const sortKey = (c: ResourceConflict) => `${c.overlap?.start ?? ''}|${c.resource.name}|${c.id}`

export type ConflictScope = {
  /** Projects the viewer may see. Sides in any other project are hidden. */
  accessibleProjectIds: ReadonlySet<string>
  /** Keep only conflicts involving this project, which must itself be accessible. */
  projectId?: string
  /** Keep only conflicts involving this activity. */
  activityId?: string
  /** Keep only conflicts for this resource. */
  resource?: { type: ResourceType; id: string }
}

/** Filters to what the viewer asked about and redacts every side the viewer is not authorized to see. */
export function scopeConflicts(result: DetectionResult, scope: ConflictScope): DetectionResult {
  const can = (projectId: string) => scope.accessibleProjectIds.has(projectId)
  const matchesResource = (r: ResourceRef) => !scope.resource || (r.type === scope.resource.type && r.id === scope.resource.id)
  if (scope.projectId && !can(scope.projectId)) return { conflicts: [], cannotAssess: [] }

  const conflicts: ResourceConflict[] = []
  const hiddenCounts = new Map<string, number>()
  for (const c of result.conflicts) {
    if (!matchesResource(c.resource) || !c.first.visible || !c.second.visible) continue
    const sides = [c.first, c.second]
    if (scope.projectId && !sides.some((s) => s.projectId === scope.projectId)) continue
    if (scope.activityId && !sides.some((s) => s.activityId === scope.activityId)) continue
    const firstOk = can(c.first.projectId)
    const secondOk = can(c.second.projectId)
    if (!firstOk && !secondOk) continue
    if (firstOk && secondOk) {
      conflicts.push(c)
      continue
    }
    // The visible side always comes first so the UI never has to reason about which one is hidden.
    // The id is rebuilt because the original embeds the hidden activity's id.
    const visible = firstOk ? c.first : c.second
    const base = `${c.resource.type}:${c.resource.id}:${visible.activityId}:hidden`
    const n = (hiddenCounts.get(base) ?? 0) + 1
    hiddenCounts.set(base, n)
    conflicts.push({ ...c, id: `${base}:${n}`, first: visible, second: { visible: false }, overlap: null })
  }

  const cannotAssess = result.cannotAssess.filter(
    (u) =>
      can(u.projectId) &&
      matchesResource(u.resource) &&
      (!scope.projectId || u.projectId === scope.projectId) &&
      (!scope.activityId || u.activityId === scope.activityId),
  )
  return { conflicts, cannotAssess }
}

/** Distinct accessible projects involved in the given conflicts. */
export function projectsInvolved(conflicts: readonly ResourceConflict[]): number {
  const ids = new Set<string>()
  for (const c of conflicts) for (const s of [c.first, c.second]) if (s.visible) ids.add(s.projectId)
  return ids.size
}

export type PageResult<T> = { data: T[] | null; error: unknown; count?: number | null }
export type AllPagesResult<T> =
  | { status: 'ready'; rows: T[] }
  | { status: 'incomplete'; rows: T[] }
  | { status: 'error'; rows: T[]; error: unknown }

/**
 * Reads every page of a query. Reports 'incomplete' rather than 'ready' whenever it cannot prove it saw every row
 * (row cap reached, or fewer rows arrived than the reported count), so callers never claim "no conflicts" from
 * partial data. Uses the exact count when available because the server may cap page size below the requested size.
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  { pageSize = 1000, maxRows = 20_000 }: { pageSize?: number; maxRows?: number } = {},
): Promise<AllPagesResult<T>> {
  const rows: T[] = []
  let total: number | null = null
  while (rows.length < maxRows) {
    const from = rows.length
    const page = await fetchPage(from, Math.min(from + pageSize, maxRows) - 1)
    if (page.error) return { status: 'error', rows, error: page.error }
    const data = page.data ?? []
    if (typeof page.count === 'number') total = page.count
    rows.push(...data)
    if (total !== null) {
      if (rows.length >= total) return { status: 'ready', rows }
      if (data.length === 0) return { status: 'incomplete', rows }
    } else if (data.length < pageSize) {
      return { status: 'ready', rows }
    }
  }
  return total !== null && rows.length >= total ? { status: 'ready', rows } : { status: 'incomplete', rows }
}
