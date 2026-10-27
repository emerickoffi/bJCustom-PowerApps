import { createClient } from '@/lib/supabase/server'
import { StaffReportsPanel, type StaffReport } from '@/components/reports/staff-reports-panel'

export async function StaffReportsSection({
  walkthroughId,
  submitted,
  canManage,
}: {
  walkthroughId: string
  submitted: boolean
  canManage: boolean
}) {
  const supabase = await createClient()
  const { data: reports } = await supabase
    .from('walkthrough_reports')
    .select('id, version, sha256, size_bytes, outstanding_issue_count, generated_at, published_at, acknowledgment_requested_at, signoff_requested_at')
    .eq('walkthrough_id', walkthroughId)
    .order('version', { ascending: false })

  const ids = (reports ?? []).map((r) => r.id)
  const [acks, signoffs] = ids.length
    ? await Promise.all([
        supabase.from('report_acknowledgments').select('report_id, signer_name, decision, comment, created_at').in('report_id', ids).order('created_at', { ascending: false }),
        supabase.from('report_builder_signoffs').select('report_id, decision, comment, created_at, reviewer:profiles(full_name)').in('report_id', ids).order('created_at', { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }]

  const list: StaffReport[] = (reports ?? []).map((r) => ({
    ...r,
    acknowledgments: (acks.data ?? []).filter((a) => a.report_id === r.id),
    signoffs: (signoffs.data ?? [])
      .filter((s) => s.report_id === r.id)
      .map((s) => ({
        decision: s.decision as 'verified' | 'rejected',
        comment: s.comment,
        created_at: s.created_at,
        reviewer: (s.reviewer as unknown as { full_name: string | null } | null)?.full_name ?? 'Builder',
      })),
  }))

  return <StaffReportsPanel walkthroughId={walkthroughId} submitted={submitted} canManage={canManage} reports={list} />
}
