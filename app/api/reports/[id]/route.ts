import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { REPORTS_BUCKET } from '@/lib/reports'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse('Not found', { status: 404 })

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return new NextResponse('Unauthorized', { status: 401 })

  // RLS limits this to assigned staff, or the homeowner once the report is published.
  const { data: report } = await supabase
    .from('walkthrough_reports')
    .select('storage_path, version, project:projects(project_number)')
    .eq('id', id)
    .maybeSingle()
  if (!report) return new NextResponse('Not found', { status: 404 })

  const projectNumber = (report.project as unknown as { project_number: string } | null)?.project_number ?? 'project'
  const { data: signed, error } = await createAdminClient()
    .storage.from(REPORTS_BUCKET)
    .createSignedUrl(report.storage_path, 60, { download: `${projectNumber}-walkthrough-report-v${report.version}.pdf` })
  if (error || !signed) return new NextResponse('Report file unavailable', { status: 502 })

  return NextResponse.redirect(signed.signedUrl, { headers: { 'Cache-Control': 'no-store' } })
}
