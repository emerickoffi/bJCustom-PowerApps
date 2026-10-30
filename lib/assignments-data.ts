import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import type { FeatureMap } from '@/lib/feature-registry'
import { isMissingTableError } from '@/lib/subcontractors'
import { projectAcceptsNewAssignments } from '@/lib/domain'
import {
  ASSIGNMENT_SELECT,
  toAssignment,
  type ActivityAssignment,
  type AssignmentAvailability,
  type CompanyOption,
} from '@/lib/assignments'
import { loadQualificationSummaries } from '@/lib/subcontractor-qualification-data'
import { QUALIFICATION_STATUS_LABELS, assignmentWarning } from '@/lib/subcontractor-qualification'

type Supabase = Awaited<ReturnType<typeof createClient>>

export type AssignmentData = {
  availability: AssignmentAvailability
  assignments: ActivityAssignment[]
  companies: CompanyOption[]
  /** False on completed, cancelled, on-hold, or pre-sale projects; existing assignments still load. */
  acceptsNew: boolean
}

const OFF: AssignmentData = { availability: 'off', assignments: [], companies: [], acceptsNew: false }

/**
 * Active assignments for one project plus the active companies that can receive work.
 * Returns 'off' unless the viewer manages and both features are on; RLS enforces the same rule.
 */
export async function loadProjectAssignments(
  supabase: Supabase,
  organizationId: string,
  projectId: string,
  features: FeatureMap,
  manager: boolean,
  projectStatus: string,
): Promise<AssignmentData> {
  if (!manager || !features.subcontractors || !features.schedule) return OFF
  const acceptsNew = projectAcceptsNewAssignments(projectStatus)
  const [assignmentsRes, companiesRes, qualification] = await Promise.all([
    supabase
      .from('schedule_activity_assignments')
      .select(ASSIGNMENT_SELECT)
      .eq('organization_id', organizationId)
      .eq('project_id', projectId)
      .eq('status', 'active')
      .order('created_at'),
    supabase
      .from('subcontractor_companies')
      .select('id, company_name, trade')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .order('company_name')
      .limit(500),
    loadQualificationSummaries(supabase, organizationId),
  ])
  if (assignmentsRes.error || companiesRes.error) {
    const missing = isMissingTableError(assignmentsRes.error) || isMissingTableError(companiesRes.error)
    return { availability: missing ? 'setup-required' : 'error', assignments: [], companies: [], acceptsNew }
  }
  return {
    availability: 'ready',
    acceptsNew,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- embedded relation typing from PostgREST
    assignments: (assignmentsRes.data ?? []).map((r) => toAssignment(r as any)),
    companies: (companiesRes.data ?? []).map((c) => {
      const option: CompanyOption = { value: c.id, label: c.company_name, trade: c.trade }
      if (qualification.availability !== 'ready') return option
      const summary = qualification.byCompany[c.id] ?? null
      const warning = assignmentWarning(summary, qualification.mode)
      if (!warning) return option
      const status = summary?.status ?? 'not_started'
      const short =
        status === 'qualified' ? 'Docs expiring soon' : QUALIFICATION_STATUS_LABELS[status]
      return { ...option, qualificationNote: { level: warning.level, short, message: warning.message } }
    }),
  }
}

export type CompanyWorkItem = ActivityAssignment & {
  activity_name: string
  activity_status: string
  planned_start: string | null
  planned_end: string | null
  project_name: string
}

/** Active work for every company in the directory, for the builder-side "Assigned work" view. */
export async function loadDirectoryWork(
  supabase: Supabase,
  organizationId: string,
  features: FeatureMap,
  companyId?: string,
) {
  if (!features.schedule) return { availability: 'off' as AssignmentAvailability, items: [] as CompanyWorkItem[] }
  let query = supabase
    .from('schedule_activity_assignments')
    .select(`${ASSIGNMENT_SELECT}, schedule_activities(name, status, planned_start, planned_end), projects(name)`)
    .eq('organization_id', organizationId)
    .eq('status', 'active')
  if (companyId) query = query.eq('subcontractor_company_id', companyId)
  const { data, error } = await query.order('created_at', { ascending: false }).limit(500)
  if (error) {
    return { availability: (isMissingTableError(error) ? 'setup-required' : 'error') as AssignmentAvailability, items: [] }
  }
  const items: CompanyWorkItem[] = (data ?? []).map((row) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- embedded relation typing from PostgREST
    const r = row as any
    return {
      ...toAssignment(r),
      activity_name: r.schedule_activities?.name ?? 'Removed activity',
      activity_status: r.schedule_activities?.status ?? 'not_started',
      planned_start: r.schedule_activities?.planned_start ?? null,
      planned_end: r.schedule_activities?.planned_end ?? null,
      project_name: r.projects?.name ?? 'Project',
    }
  })
  return { availability: 'ready' as AssignmentAvailability, items }
}
