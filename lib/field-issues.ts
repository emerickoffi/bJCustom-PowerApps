import { createClient } from '@/lib/supabase/server'
import { getStaffMembers } from '@/lib/queries'
import { ROLE_LABELS } from '@/lib/domain'

export type IssueSourceKind = 'daily_log' | 'walkthrough'
export type IssueSource = { kind: IssueSourceKind; id: string; label: string }
export type AssigneeOption = { value: string; label: string }

export const FIELD_ISSUE_DEFAULT_CATEGORIES = [
  'General',
  'Site work',
  'Framing',
  'Electrical',
  'Plumbing',
  'HVAC',
  'Drywall',
  'Flooring',
  'Paint & finishes',
  'Exterior',
]

/**
 * People who can own a field issue on this project: active builder staff who can already see it.
 * Mirrors public.issue_assignee_eligible so the list never offers someone the server would refuse.
 */
export async function getIssueReportOptions(organizationId: string, projectId: string) {
  const supabase = await createClient()
  const [staff, projectRes, membersRes, categoriesRes, orgRes] = await Promise.all([
    getStaffMembers(organizationId, ['org_admin', 'project_manager', 'builder_staff']),
    supabase.from('projects').select('project_manager_id').eq('id', projectId).eq('organization_id', organizationId).maybeSingle(),
    supabase.from('project_members').select('user_id').eq('project_id', projectId),
    supabase.from('project_issues').select('category').eq('project_id', projectId).limit(500),
    supabase.from('organizations').select('name').eq('id', organizationId).maybeSingle(),
  ])
  const organizationName = (orgRes.data?.name as string | undefined) || 'Builder'
  const projectManagerId = projectRes.data?.project_manager_id ?? null
  const memberIds = new Set((membersRes.data ?? []).map((m) => m.user_id as string))

  const assignees: AssigneeOption[] = staff
    .filter((s) => s.role !== 'builder_staff' || s.user_id === projectManagerId || memberIds.has(s.user_id))
    .map((s) => {
      const projectRole = s.user_id === projectManagerId ? 'Project manager on this project' : ROLE_LABELS[s.role]
      return { value: s.user_id, label: `${s.full_name || s.email || 'Team member'} · ${organizationName} · ${projectRole}` }
    })
    .sort((a, b) => a.label.localeCompare(b.label))

  const used = (categoriesRes.data ?? []).map((r) => (r.category as string)?.trim()).filter(Boolean)
  const categories = Array.from(new Set([...used, ...FIELD_ISSUE_DEFAULT_CATEGORIES]))

  return { assignees, categories }
}
