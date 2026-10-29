import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import { ASSIGNABLE_PROJECT_STATUSES } from '@/lib/domain'
import { isMissingTableError, SUBCONTRACTOR_COLUMNS, type SubcontractorCompany } from '@/lib/subcontractors'
import { isAssignmentSetupError, type AssignableProject, type ProjectAssignmentRecord } from '@/lib/subcontractor-projects'

type Supabase = Awaited<ReturnType<typeof createClient>>

export type ProjectsAvailability = 'ready' | 'setup-required' | 'error'

/** One company scoped to the caller's organization. Null when it does not exist there; RLS enforces the same. */
export async function loadSubcontractor(supabase: Supabase, organizationId: string, companyId: string) {
  const { data, error } = await supabase
    .from('subcontractor_companies')
    .select(SUBCONTRACTOR_COLUMNS)
    .eq('organization_id', organizationId)
    .eq('id', companyId)
    .maybeSingle()
  if (error) throw new Error('Subcontractor could not be loaded')
  return (data as SubcontractorCompany | null) ?? null
}

/**
 * Every association this company has ever had, current and ended. Setup is reported as required until both
 * assignment migrations are applied (a missing table or a missing ended_at column).
 */
export async function loadProjectAssignments(
  supabase: Supabase,
  organizationId: string,
  companyId: string,
): Promise<{ availability: ProjectsAvailability; records: ProjectAssignmentRecord[] }> {
  const { data, error } = await supabase
    .from('subcontractor_project_assignments')
    .select('id, created_at, ended_at, end_reason, projects(id, name, project_number, status)')
    .eq('organization_id', organizationId)
    .eq('subcontractor_company_id', companyId)
    .order('created_at')
    .limit(1000)
  if (error) return { availability: isAssignmentSetupError(error) ? 'setup-required' : 'error', records: [] }
  const records = (data ?? []).flatMap((row) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- embedded relation typing from PostgREST
    const project = (row as any).projects as AssignableProject | null
    return project
      ? [
          {
            assignment_id: row.id as string,
            project,
            associated_at: row.created_at as string,
            ended_at: (row.ended_at as string | null) ?? null,
            end_reason: (row.end_reason as string | null) ?? null,
          },
        ]
      : []
  })
  return { availability: 'ready', records }
}

/**
 * Active scheduled activity names per project for this company, used to warn before an assignment is ended.
 * Null when they cannot be read; the database still refuses to end an assignment with unacknowledged active work.
 */
export async function loadActiveWorkByProject(
  supabase: Supabase,
  organizationId: string,
  companyId: string,
): Promise<Record<string, string[]> | null> {
  const { data, error } = await supabase
    .from('schedule_activity_assignments')
    .select('project_id, schedule_activities(name)')
    .eq('organization_id', organizationId)
    .eq('subcontractor_company_id', companyId)
    .eq('status', 'active')
    .limit(1000)
  if (error) return null
  const byProject: Record<string, string[]> = {}
  for (const row of data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- embedded relation typing from PostgREST
    const name = ((row as any).schedule_activities?.name as string | undefined) ?? 'Scheduled activity'
    ;(byProject[row.project_id as string] ??= []).push(name)
  }
  return byProject
}

/** Projects that can receive new associations right now. */
export async function loadAssignableProjects(supabase: Supabase, organizationId: string) {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, project_number, status')
    .eq('organization_id', organizationId)
    .in('status', [...ASSIGNABLE_PROJECT_STATUSES])
    .order('project_number')
    .limit(500)
  return { projects: (data ?? []) as AssignableProject[], error: Boolean(error) }
}
