import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { loadQualificationSummaries } from '@/lib/subcontractor-qualification-data'
import { assignmentWarning, qualificationBadge } from '@/lib/subcontractor-qualification'

type Client = Awaited<ReturnType<typeof createClient>>

export type CompanyOption = { id: string; name: string; trade: string; badge: string; blocked: string | null; warning: string | null }
export type DocumentOption = { id: string; name: string; versionNumber: number }
export type ActivityOption = { id: string; name: string }

export { emptyRequestDraft } from '@/lib/subcontract-quotes'

export async function loadRequestFormOptions(supabase: Client, organizationId: string, projectId: string) {
  const [companies, documents, activities] = await Promise.all([
    supabase
      .from('subcontractor_companies')
      .select('id, company_name, trade')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .order('company_name'),
    supabase
      .from('project_documents')
      .select('id, name, current_version_number')
      .eq('organization_id', organizationId)
      .eq('project_id', projectId)
      .is('archived_at', null)
      .not('current_version_id', 'is', null)
      .order('name'),
    supabase.from('schedule_activities').select('id, name').eq('project_id', projectId).order('name'),
  ])
  const rows = companies.data ?? []
  const q = await loadQualificationSummaries(supabase, organizationId, rows.map((c) => c.id))
  const companyOptions: CompanyOption[] = rows.map((c) => {
    const summary = q.availability === 'ready' ? (q.byCompany[c.id] ?? null) : null
    const warning = q.availability === 'ready' ? assignmentWarning(summary, q.mode) : null
    return {
      id: c.id,
      name: c.company_name,
      trade: c.trade,
      badge: qualificationBadge(summary).label,
      blocked: warning?.level === 'block' ? warning.message : null,
      warning: warning && warning.level !== 'block' ? warning.message : null,
    }
  })
  return {
    companies: companyOptions,
    documents: (documents.data ?? []).map((d) => ({ id: d.id, name: d.name, versionNumber: d.current_version_number })) as DocumentOption[],
    activities: (activities.data ?? []) as ActivityOption[],
    error: companies.error ?? documents.error ?? null,
  }
}
