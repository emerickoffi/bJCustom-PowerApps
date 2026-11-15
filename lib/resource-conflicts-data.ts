import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import { isMissingTableError } from '@/lib/subcontractors'
import {
  detectResourceConflicts,
  fetchAllPages,
  scopeConflicts,
  type ConflictActivity,
  type ConflictAssignment,
  type ConflictProject,
  type ConflictScope,
  type DetectionResult,
  type ResourceType,
} from '@/lib/resource-conflicts'

type Supabase = Awaited<ReturnType<typeof createClient>>

export type ConflictLoadStatus = 'ready' | 'incomplete' | 'error'

export type ResourceConflictLoad = {
  status: ConflictLoadStatus
  result: DetectionResult
  /** Resource types that were actually checked; subcontractors need manager access and both features. */
  checked: ResourceType[]
}

export type ConflictLoadOptions = {
  organizationId: string
  includeSubcontractors: boolean
  staffNames: Record<string, string>
  scope?: Omit<ConflictScope, 'accessibleProjectIds'>
  /** Narrows queries to one resource; used by the assignment-form check. */
  focus?: { type: ResourceType; id: string }
  /** Applies an unsaved change before detection so the warning reflects what would be saved. */
  propose?: (data: { activities: ConflictActivity[]; assignments: ConflictAssignment[] }) => void
}

const ACTIVITY_FIELDS = 'id, project_id, organization_id, name, status, planned_start, planned_end, assigned_to'
const EXCLUDED_STATUS_FILTER = '(completed,skipped)'

const worst = (...s: ConflictLoadStatus[]): ConflictLoadStatus =>
  s.includes('error') ? 'error' : s.includes('incomplete') ? 'incomplete' : 'ready'

const EMPTY: DetectionResult = { conflicts: [], cannotAssess: [] }

/**
 * Loads every open activity and active assignment for the organization in a fixed number of bulk, paged queries
 * (never per activity) through the viewer's RLS client, so other organizations and projects the viewer cannot
 * access are never read. Detection is deterministic; nothing is written.
 */
export async function loadResourceConflicts(supabase: Supabase, options: ConflictLoadOptions): Promise<ResourceConflictLoad> {
  const { organizationId, focus } = options
  const includeSubs = options.includeSubcontractors && focus?.type !== 'staff'
  const includeStaff = focus?.type !== 'subcontractor'

  const projectsP = fetchAllPages<ConflictProject>((from, to) =>
    supabase
      .from('projects')
      .select('id, name, organization_id, status', { count: 'exact' })
      .eq('organization_id', organizationId)
      .is('archived_at', null)
      .order('id')
      .range(from, to),
  )

  const activitiesP = includeStaff
    ? fetchAllPages<ConflictActivity>((from, to) => {
        let q = supabase
          .from('schedule_activities')
          .select(ACTIVITY_FIELDS, { count: 'exact' })
          .eq('organization_id', organizationId)
          .not('status', 'in', EXCLUDED_STATUS_FILTER)
        if (focus?.type === 'staff') q = q.eq('assigned_to', focus.id)
        return q.order('id').range(from, to)
      })
    : Promise.resolve({ status: 'ready' as const, rows: [] as ConflictActivity[] })

  type AssignmentRow = {
    id: string
    organization_id: string
    project_id: string
    schedule_activity_id: string
    subcontractor_company_id: string
    subcontractor_companies: { company_name: string } | null
    schedule_activities: ConflictActivity | null
  }
  const assignmentsP = includeSubs
    ? fetchAllPages<AssignmentRow>((from, to) => {
        // The embedded activity lets a narrowed check skip the full activity scan.
        let q = supabase
          .from('schedule_activity_assignments')
          .select(
            `id, organization_id, project_id, schedule_activity_id, subcontractor_company_id, subcontractor_companies(company_name), schedule_activities(${ACTIVITY_FIELDS})`,
            { count: 'exact' },
          )
          .eq('organization_id', organizationId)
          .eq('status', 'active')
        if (focus?.type === 'subcontractor') q = q.eq('subcontractor_company_id', focus.id)
        return q.order('id').range(from, to) as unknown as PromiseLike<{ data: AssignmentRow[] | null; error: unknown; count: number | null }>
      })
    : Promise.resolve({ status: 'ready' as const, rows: [] as AssignmentRow[] })

  const [projects, activities, assignments] = await Promise.all([projectsP, activitiesP, assignmentsP])

  const checked: ResourceType[] = []
  if (includeStaff) checked.push('staff')
  let assignmentStatus: ConflictLoadStatus = assignments.status
  if (includeSubs) {
    if (assignments.status === 'error' && isMissingTableError(assignments.error as { code?: string; message?: string })) {
      assignmentStatus = 'ready'
    } else checked.push('subcontractor')
  }

  const status = worst(projects.status, activities.status, assignmentStatus)
  if (status === 'error' || checked.length === 0) return { status: status === 'error' ? 'error' : 'ready', result: EMPTY, checked }

  const activityRows = [...activities.rows]
  const known = new Set(activityRows.map((a) => a.id))
  const assignmentRows: ConflictAssignment[] = []
  if (checked.includes('subcontractor')) {
    for (const r of assignments.rows) {
      assignmentRows.push({
        id: r.id,
        organization_id: r.organization_id,
        project_id: r.project_id,
        schedule_activity_id: r.schedule_activity_id,
        subcontractor_company_id: r.subcontractor_company_id,
        company_name: r.subcontractor_companies?.company_name ?? 'Subcontractor',
      })
      const a = r.schedule_activities
      if (a && !known.has(a.id)) {
        known.add(a.id)
        // Staff checks need the full activity scan; activities found only through assignments must not add staff matches.
        activityRows.push(includeStaff ? a : { ...a, assigned_to: null })
      }
    }
  }

  options.propose?.({ activities: activityRows, assignments: assignmentRows })

  const detected = detectResourceConflicts({
    organizationId,
    projects: projects.rows,
    activities: activityRows,
    assignments: assignmentRows,
    staffNames: options.staffNames,
  })
  const result = scopeConflicts(detected, {
    ...options.scope,
    accessibleProjectIds: new Set(projects.rows.map((p) => p.id)),
  })
  return { status, result, checked }
}
