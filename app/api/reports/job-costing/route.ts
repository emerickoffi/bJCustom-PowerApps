import { NextResponse } from 'next/server'
import { canManage, getSession } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { loadJobCostingReport } from '@/lib/job-costing-report-data'
import { exportFileName, jobCostingCsv } from '@/lib/data-exports'
import type { ReportScope } from '@/lib/job-costing-report'

const NO_STORE = { 'Cache-Control': 'no-store' }
const SCOPES: ReportScope[] = ['active', 'completed', 'all']

/** The job costing report as a spreadsheet, for administrators and project managers when the report module is on. */
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401, headers: NO_STORE })
  if (!session.organizationId || session.activationRequired || !canManage(session.role)) {
    return NextResponse.json({ error: 'This report is not available.' }, { status: 403, headers: NO_STORE })
  }
  const features = await getOrgFeatures(session.organizationId)
  if (!features.project_reports) return NextResponse.json({ error: 'This report is turned off.' }, { status: 404, headers: NO_STORE })

  const raw = new URL(request.url).searchParams.get('scope')
  const scope: ReportScope = SCOPES.includes(raw as ReportScope) ? (raw as ReportScope) : 'active'
  const { rows } = await loadJobCostingReport(session.organizationId, scope)
  const today = new Date().toISOString().slice(0, 10)
  return new NextResponse(jobCostingCsv(rows), {
    headers: {
      ...NO_STORE,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFileName(`job-costing-${scope}`, today)}"`,
    },
  })
}
