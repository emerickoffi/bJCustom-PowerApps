'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { canManage, getSession } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { getStaffMembers } from '@/lib/queries'
import { loadResourceConflicts, type ConflictLoadStatus } from '@/lib/resource-conflicts-data'
import type { ConflictActivity, ResourceConflict, ResourceType } from '@/lib/resource-conflicts'

export type ProposalCheck =
  | { status: 'unavailable'; message: string }
  | { status: 'undated'; message: string }
  | { status: ConflictLoadStatus; conflicts: ResourceConflict[] }

const inputSchema = z.object({
  projectId: z.uuid(),
  activityId: z.uuid(),
  type: z.enum(['subcontractor', 'staff']),
  resourceId: z.uuid(),
  replacesAssignmentId: z.uuid().nullish(),
})

const PROPOSED_ID = 'proposed-assignment'

/**
 * Read-only check of what a proposed assignment would overlap, using current database data (not the page's
 * initial snapshot). Never blocks or changes anything; the assignment actions keep their own validation.
 */
export async function checkProposedAssignmentAction(input: {
  projectId: string
  activityId: string
  type: ResourceType
  resourceId: string
  replacesAssignmentId?: string | null
}): Promise<ProposalCheck> {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) return { status: 'unavailable', message: 'Conflicts could not be checked for this selection.' }
  const { projectId, activityId, type, resourceId, replacesAssignmentId } = parsed.data

  const session = await getSession()
  if (!session?.organizationId || !session.role || session.role === 'client' || !canManage(session.role)) {
    return { status: 'unavailable', message: 'Conflicts could not be checked.' }
  }
  const organizationId = session.organizationId
  const features = await getOrgFeatures(organizationId)
  if (!features.schedule || (type === 'subcontractor' && !features.subcontractors)) {
    return { status: 'unavailable', message: 'Conflict checks require the Schedule feature.' }
  }

  const supabase = await createClient()
  const [{ data: target }, companyRes, staff] = await Promise.all([
    supabase
      .from('schedule_activities')
      .select('id, project_id, organization_id, name, status, planned_start, planned_end, assigned_to')
      .eq('id', activityId)
      .eq('project_id', projectId)
      .eq('organization_id', organizationId)
      .maybeSingle(),
    type === 'subcontractor'
      ? supabase.from('subcontractor_companies').select('company_name').eq('id', resourceId).eq('organization_id', organizationId).maybeSingle()
      : Promise.resolve({ data: null }),
    getStaffMembers(organizationId, ['org_admin', 'project_manager', 'builder_staff']),
  ])
  if (!target) return { status: 'unavailable', message: 'This activity could not be found.' }
  const activity = target as ConflictActivity
  if (!activity.planned_start || !activity.planned_end) {
    return { status: 'undated', message: 'Add a planned start and finish to this activity to check for conflicts in other projects.' }
  }
  const staffNames = Object.fromEntries(staff.map((s) => [s.user_id, s.full_name || s.email || 'Team member']))
  if (type === 'staff' && !staffNames[resourceId]) return { status: 'unavailable', message: 'Conflicts could not be checked.' }

  const load = await loadResourceConflicts(supabase, {
    organizationId,
    includeSubcontractors: type === 'subcontractor',
    staffNames,
    focus: { type, id: resourceId },
    scope: { activityId, resource: { type, id: resourceId } },
    propose: ({ activities, assignments }) => {
      const i = activities.findIndex((a) => a.id === activity.id)
      if (type === 'staff') {
        const next = { ...activity, assigned_to: resourceId }
        if (i === -1) activities.push(next)
        else activities[i] = next
        return
      }
      if (i === -1) activities.push({ ...activity, assigned_to: null })
      for (let k = assignments.length - 1; k >= 0; k--) if (assignments[k].id === replacesAssignmentId) assignments.splice(k, 1)
      assignments.push({
        id: PROPOSED_ID,
        organization_id: organizationId,
        project_id: projectId,
        schedule_activity_id: activity.id,
        subcontractor_company_id: resourceId,
        company_name: (companyRes.data as { company_name: string } | null)?.company_name ?? 'This subcontractor',
      })
    },
  })
  if (load.status === 'error') return { status: 'error', conflicts: [] }
  return { status: load.status, conflicts: load.result.conflicts }
}
