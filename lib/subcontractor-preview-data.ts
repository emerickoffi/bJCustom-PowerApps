import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { canManage, getSession } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { loadCompanyContacts } from '@/lib/contacts-data'
import { loadQualificationDetail } from '@/lib/subcontractor-qualification-data'
import { loadPerformanceDetail } from '@/lib/subcontractor-performance-data'
import { loadDirectoryWork } from '@/lib/assignments-data'
import { loadAssignableProjects } from '@/lib/subcontractor-detail-data'
import { SUBCONTRACTOR_COLUMNS, isMissingTableError, type SubcontractorCompany } from '@/lib/subcontractors'
import type { ProjectStatus } from '@/lib/domain'
import type {
  QualificationIssue,
  SubcontractorPreview,
  SubcontractorPreviewContact,
  SubcontractorPreviewProject,
  SubcontractorPreviewWork,
} from '@/lib/subcontractor-preview'

type Result = { ok: true; preview: SubcontractorPreview } | { ok: false; status: number; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NOT_FOUND: Result = { ok: false, status: 404, error: 'This subcontractor is no longer available.' }
const PROBLEM_LABELS = { missing: 'Missing', expired: 'Expired', rejected: 'Rejected' } as const

type ProjectRow = { project: { id: string; name: string; project_number: string | null; status: ProjectStatus } | null }

/**
 * One subcontractor's panel, loaded only when it is selected. Every query is scoped to the viewer's organization,
 * and each section reports its own failure so a broken lookup never reads as an empty one.
 */
export async function loadSubcontractorPreview(companyId: string): Promise<Result> {
  if (!UUID.test(companyId)) return NOT_FOUND
  const session = await getSession()
  if (!session) return { ok: false, status: 401, error: 'Please sign in again.' }
  if (!session.organizationId || !session.role || !canManage(session.role) || session.activationRequired) {
    return { ok: false, status: 403, error: 'You do not have access to this subcontractor.' }
  }
  const organizationId = session.organizationId
  const features = await getOrgFeatures(organizationId)
  if (!features.subcontractors) return { ok: false, status: 403, error: 'You do not have access to this subcontractor.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('subcontractor_companies')
    .select(SUBCONTRACTOR_COLUMNS)
    .eq('organization_id', organizationId)
    .eq('id', companyId)
    .maybeSingle()
  if (error) throw new Error('subcontractor_preview_failed')
  if (!data) return NOT_FOUND
  const company = data as SubcontractorCompany

  const [directory, qualification, projectsRes, work, performance, assignable] = await Promise.all([
    supabase
      .from('business_companies')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('subcontractor_company_id', company.id)
      .maybeSingle(),
    loadQualificationDetail(supabase, organizationId, company.id),
    supabase
      .from('subcontractor_project_assignments')
      .select('project:projects(id, name, project_number, status)')
      .eq('organization_id', organizationId)
      .eq('subcontractor_company_id', company.id)
      .is('ended_at', null)
      .limit(200),
    loadDirectoryWork(supabase, organizationId, features, company.id),
    loadPerformanceDetail(supabase, organizationId, company.id),
    loadAssignableProjects(supabase, organizationId),
  ])

  const href = `/subcontractors/${company.id}`
  const directoryCompanyId = directory.data?.id ?? null

  let contact: SubcontractorPreview['contact']
  if (directory.error) contact = { state: 'error' }
  else {
    let primary: SubcontractorPreviewContact | null = null
    if (directoryCompanyId) {
      const contacts = await loadCompanyContacts(supabase, organizationId, directoryCompanyId)
      const match = contacts.find((c) => c.is_primary_contact && c.status === 'active' && c.person_status === 'active')
      if (match) primary = { name: match.name, role: match.role, email: match.email, phone: match.primary_phone }
    }
    if (!primary && (company.email || company.phone)) primary = { name: null, role: null, email: company.email, phone: company.phone }
    contact = { state: 'ready', primary }
  }

  const qualificationSection: SubcontractorPreview['qualification'] =
    qualification.availability === 'setup-required'
      ? { state: 'hidden' }
      : qualification.availability === 'error'
        ? { state: 'error' }
        : {
            state: 'ready',
            summary: qualification.summary,
            href: `${href}?tab=qualification`,
            issues: qualification.items
              .filter((i) => i.mandatory && (i.effective === 'missing' || i.effective === 'expired' || i.effective === 'rejected'))
              .map<QualificationIssue>((i) => ({
                key: i.requirementId,
                title: i.title,
                problem: PROBLEM_LABELS[i.effective as keyof typeof PROBLEM_LABELS],
              })),
          }

  let projects: SubcontractorPreview['projects']
  if (projectsRes.error) projects = isMissingTableError(projectsRes.error) ? { state: 'hidden' } : { state: 'error' }
  else {
    const items = ((projectsRes.data ?? []) as unknown as ProjectRow[])
      .flatMap((r) => (r.project ? [r.project] : []))
      .map<SubcontractorPreviewProject>((p) => ({
        id: p.id,
        name: p.name,
        number: p.project_number ?? '',
        status: p.status,
        href: `/projects/${p.id}`,
      }))
      .sort((a, b) => a.number.localeCompare(b.number) || a.name.localeCompare(b.name))
    projects = { state: 'ready', items, href: `${href}?tab=projects` }
  }

  let assign: SubcontractorPreview['assign']
  if (projects.state === 'hidden') assign = { state: 'hidden' }
  else if (company.status !== 'active') {
    assign = { state: 'unavailable', reason: 'Reactivate this subcontractor before assigning projects.', href: null }
  } else if (directory.error || assignable.error) {
    assign = { state: 'unavailable', reason: 'Projects could not be loaded for assignment.', href: null }
  } else if (!directoryCompanyId) {
    assign = { state: 'unavailable', reason: 'Save this subcontractor once to link it to the directory.', href: `${href}/edit` }
  } else {
    const assigned = new Set(projects.state === 'ready' ? projects.items.map((p) => p.id) : [])
    assign = {
      state: 'ready',
      directoryCompanyId,
      projects: assignable.projects
        .filter((p) => !assigned.has(p.id))
        .map((p) => ({ id: p.id, name: p.name, number: p.project_number ?? '', status: p.status as ProjectStatus })),
    }
  }

  let workSection: SubcontractorPreview['work']
  if (work.availability === 'off' || work.availability === 'setup-required') workSection = { state: 'hidden' }
  else if (work.availability === 'error') workSection = { state: 'error' }
  else {
    const today = new Date().toISOString().slice(0, 10)
    const open = work.items
      .filter((w) => w.activity_status !== 'completed' && w.activity_status !== 'skipped')
      .map<SubcontractorPreviewWork>((w) => ({
        id: w.id,
        activityName: w.activity_name,
        projectName: w.project_name,
        status: w.activity_status,
        plannedEnd: w.planned_end,
        overdue: Boolean(w.planned_end && w.planned_end < today),
        href: `/projects/${w.project_id}/schedule?activity=${w.schedule_activity_id}`,
      }))
      .sort(
        (a, b) =>
          Number(b.overdue) - Number(a.overdue) ||
          (a.plannedEnd ?? '9999').localeCompare(b.plannedEnd ?? '9999') ||
          a.activityName.localeCompare(b.activityName),
      )
    workSection = { state: 'ready', items: open, total: open.length, href }
  }

  const performanceSection: SubcontractorPreview['performance'] =
    performance.availability === 'setup-required'
      ? { state: 'hidden' }
      : performance.availability === 'error'
        ? { state: 'error' }
        : { state: 'ready', average: performance.summary.average, count: performance.summary.count }

  return {
    ok: true,
    preview: {
      id: company.id,
      name: company.company_name,
      trade: company.trade,
      status: company.status,
      href,
      contact,
      qualification: qualificationSection,
      projects,
      assign,
      work: workSection,
      performance: performanceSection,
    },
  }
}
