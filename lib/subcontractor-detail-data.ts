import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import { ASSIGNABLE_PROJECT_STATUSES } from '@/lib/domain'
import { isMissingTableError, SUBCONTRACTOR_COLUMNS, type SubcontractorCompany } from '@/lib/subcontractors'
import type { AssignableProject } from '@/lib/subcontractor-projects'

type Supabase = Awaited<ReturnType<typeof createClient>>

export type AssociatedProject = AssignableProject & { associated_at: string }
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

/** Every project this company has ever been associated with, including completed ones kept as history. */
export async function loadAssociatedProjects(
  supabase: Supabase,
  organizationId: string,
  companyId: string,
): Promise<{ availability: ProjectsAvailability; projects: AssociatedProject[] }> {
  const { data, error } = await supabase
    .from('subcontractor_project_assignments')
    .select('created_at, projects(id, name, project_number, status)')
    .eq('organization_id', organizationId)
    .eq('subcontractor_company_id', companyId)
    .order('created_at')
  if (error) return { availability: isMissingTableError(error) ? 'setup-required' : 'error', projects: [] }
  const projects = (data ?? []).flatMap((row) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- embedded relation typing from PostgREST
    const p = (row as any).projects as AssignableProject | null
    return p ? [{ ...p, associated_at: row.created_at as string }] : []
  })
  return { availability: 'ready', projects }
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
