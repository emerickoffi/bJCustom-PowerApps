import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { ACTIVE_PROJECT_STATUSES } from '@/lib/domain'
import { loadProjectFinancials } from '@/lib/job-costing-data'
import { reportRow, sortReportRows, type JobCostReportRow, type ReportScope } from '@/lib/job-costing-report'

/** Jobs loaded at once. Each one runs the same handful of reads as its Financials tab. */
const CONCURRENCY = 6
/** Keeps the page fast; a company past this many jobs in one view is told to narrow it. */
export const REPORT_MAX_JOBS = 150

const SCOPE_STATUSES: Record<ReportScope, string[] | null> = {
  active: ACTIVE_PROJECT_STATUSES,
  completed: ['completed'],
  all: null,
}

/**
 * Company job costing rows for managers. Reads go through RLS with the signed-in user's session, and every number comes
 * from loadProjectFinancials, so each row matches that project's Financials tab exactly.
 */
export async function loadJobCostingReport(
  organizationId: string,
  scope: ReportScope,
): Promise<{ rows: JobCostReportRow[]; truncated: boolean }> {
  const supabase = await createClient()
  let query = supabase
    .from('projects')
    .select('id, project_number, name, status')
    .eq('organization_id', organizationId)
    .is('archived_at', null)
    .order('name')
    .limit(REPORT_MAX_JOBS + 1)
  const statuses = SCOPE_STATUSES[scope]
  if (statuses) query = query.in('status', statuses)
  const { data, error } = await query
  if (error) throw new Error(`Jobs could not be loaded: ${error.message}`)

  const projects = (data ?? []).slice(0, REPORT_MAX_JOBS)
  const rows: JobCostReportRow[] = new Array(projects.length)
  let next = 0
  async function worker() {
    while (next < projects.length) {
      const i = next++
      const p = projects[i]
      try {
        const { summary } = await loadProjectFinancials(p.id)
        rows[i] = reportRow(p, summary)
      } catch (e) {
        console.error('[job-costing-report] project failed', p.id, e)
        rows[i] = reportRow(p, null)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, projects.length) }, worker))
  return { rows: sortReportRows(rows), truncated: (data ?? []).length > REPORT_MAX_JOBS }
}
