'use server'

import { createHash, randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSession, requireManager } from '@/lib/session'
import { REPORTS_BUCKET, acknowledgmentStatement, buildWalkthroughSnapshot, renderWalkthroughPdf } from '@/lib/reports'

export type ReportActionResult = { ok: boolean; message: string }

const fail = (message: string): ReportActionResult => ({ ok: false, message })
const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)

function revalidateReport(projectId: string, walkthroughId: string) {
  revalidatePath(`/projects/${projectId}/walkthroughs/${walkthroughId}`)
  revalidatePath(`/portal/walkthroughs/${walkthroughId}`)
}

export async function generateWalkthroughReportAction(walkthroughId: string): Promise<ReportActionResult> {
  if (!isUuid(walkthroughId)) return fail('Invalid walkthrough.')
  const session = await requireManager()
  const supabase = await createClient()

  const built = await buildWalkthroughSnapshot(supabase, walkthroughId, session.organizationId)
  if ('error' in built) return fail(built.error ?? 'Could not build the report.')
  const { snapshot, projectId } = built

  const admin = createAdminClient()
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: latest } = await supabase
      .from('walkthrough_reports')
      .select('version')
      .eq('walkthrough_id', walkthroughId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
    const version = (latest?.version ?? 0) + 1

    const pdf = await renderWalkthroughPdf(snapshot, version)
    const sha256 = createHash('sha256').update(pdf).digest('hex')
    const storagePath = `${session.organizationId}/${projectId}/walkthroughs/${walkthroughId}/v${version}-${randomUUID()}.pdf`

    const upload = await admin.storage.from(REPORTS_BUCKET).upload(storagePath, pdf, { contentType: 'application/pdf', upsert: false })
    if (upload.error) return fail('The report PDF could not be stored. Please try again.')

    const { error } = await supabase.from('walkthrough_reports').insert({
      organization_id: session.organizationId,
      project_id: projectId,
      walkthrough_id: walkthroughId,
      version,
      snapshot,
      storage_path: storagePath,
      sha256,
      size_bytes: pdf.byteLength,
      outstanding_issue_count: snapshot.totals.outstandingIssues,
    })
    if (!error) {
      revalidateReport(projectId, walkthroughId)
      return { ok: true, message: `Report version ${version} generated.` }
    }
    await admin.storage.from(REPORTS_BUCKET).remove([storagePath])
    if (error.code !== '23505') return fail(error.message)
  }
  return fail('Another report was generated at the same time. Refresh and try again.')
}

type ReportRow = { id: string; project_id: string; walkthrough_id: string; organization_id: string; version: number; sha256: string; published_at: string | null }

async function loadReport(reportId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('walkthrough_reports')
    .select('id, project_id, walkthrough_id, organization_id, version, sha256, published_at')
    .eq('id', reportId)
    .maybeSingle()
  return { supabase, report: data as ReportRow | null }
}

export async function updateReportWorkflowAction(
  reportId: string,
  step: 'publish' | 'request_acknowledgment' | 'request_signoff',
): Promise<ReportActionResult> {
  if (!isUuid(reportId)) return fail('Invalid report.')
  const session = await requireManager()
  const { supabase, report } = await loadReport(reportId)
  if (!report || report.organization_id !== session.organizationId) return fail('Report not found.')

  const now = new Date().toISOString()
  const patch =
    step === 'publish'
      ? { published_at: now }
      : step === 'request_acknowledgment'
        ? { acknowledgment_requested_at: now }
        : { signoff_requested_at: now }
  const { error } = await supabase.from('walkthrough_reports').update(patch).eq('id', reportId)
  if (error) return fail(error.message)
  revalidateReport(report.project_id, report.walkthrough_id)
  const label = step === 'publish' ? 'Report published to the homeowner portal.' : step === 'request_acknowledgment' ? 'Acknowledgment requested.' : 'Final sign-off requested.'
  return { ok: true, message: label }
}

export async function builderSignoffAction(reportId: string, decision: 'verified' | 'rejected', comment: string): Promise<ReportActionResult> {
  if (!isUuid(reportId) || !['verified', 'rejected'].includes(decision)) return fail('Invalid request.')
  const session = await requireManager()
  const trimmed = comment.trim().slice(0, 2000)
  if (decision === 'rejected' && !trimmed) return fail('Explain why the report is not verified.')
  const { supabase, report } = await loadReport(reportId)
  if (!report || report.organization_id !== session.organizationId) return fail('Report not found.')

  const { error } = await supabase.from('report_builder_signoffs').insert({
    organization_id: report.organization_id,
    project_id: report.project_id,
    report_id: report.id,
    report_version: report.version,
    reviewer_id: session.userId,
    decision,
    comment: trimmed || null,
  })
  if (error) return fail(error.message)
  revalidateReport(report.project_id, report.walkthrough_id)
  return { ok: true, message: decision === 'verified' ? 'Builder verification recorded.' : 'Rejection recorded.' }
}

export async function homeownerAcknowledgeAction(
  reportId: string,
  decision: 'acknowledged' | 'accepted' | 'changes_requested',
  signerName: string,
  comment: string,
): Promise<ReportActionResult> {
  if (!isUuid(reportId) || !['acknowledged', 'accepted', 'changes_requested'].includes(decision)) return fail('Invalid request.')
  const session = await getSession()
  if (!session || session.role !== 'client') return fail('Only the homeowner can respond to this report.')
  const name = signerName.trim().slice(0, 160)
  if (name.length < 2) return fail('Type your full name to sign.')
  const trimmed = comment.trim().slice(0, 2000)
  if (decision === 'changes_requested' && !trimmed) return fail('Describe the changes you are requesting.')

  const { supabase, report } = await loadReport(reportId)
  if (!report || !report.published_at) return fail('This report is not available.')

  const { error } = await supabase.from('report_acknowledgments').insert({
    organization_id: report.organization_id,
    project_id: report.project_id,
    report_id: report.id,
    report_version: report.version,
    report_sha256: report.sha256,
    user_id: session.userId,
    signer_name: name,
    decision,
    comment: trimmed || null,
    acknowledgment_text: acknowledgmentStatement(report.version, report.sha256, decision),
  })
  if (error) return fail(error.message)
  revalidateReport(report.project_id, report.walkthrough_id)
  return { ok: true, message: 'Your response has been recorded.' }
}
