import { NextResponse } from 'next/server'
import { canManage, getSession } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { loadScheduleReport } from '@/lib/schedule-report-data'
import { parseLookahead } from '@/lib/schedule-report'
import { exportFileName, scheduleReportCsv } from '@/lib/data-exports'

const NO_STORE = { 'Cache-Control': 'no-store' }

/** The schedule report as a spreadsheet, for administrators and project managers when Schedule reports is on. */
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401, headers: NO_STORE })
  if (!session.organizationId || session.activationRequired || !canManage(session.role)) {
    return NextResponse.json({ error: 'This report is not available.' }, { status: 403, headers: NO_STORE })
  }
  const features = await getOrgFeatures(session.organizationId)
  if (!features.schedule_reports) return NextResponse.json({ error: 'This report is turned off.' }, { status: 404, headers: NO_STORE })

  const weeks = parseLookahead(new URL(request.url).searchParams.get('weeks'))
  const report = await loadScheduleReport(session.organizationId, weeks)
  return new NextResponse(scheduleReportCsv(report), {
    headers: {
      ...NO_STORE,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFileName(`schedule-report-${weeks}-weeks`, report.today)}"`,
    },
  })
}
