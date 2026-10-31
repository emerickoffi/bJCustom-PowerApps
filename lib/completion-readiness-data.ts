import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import { evaluateCompletionReadiness, type ReadinessFacts, type ReadinessSummary } from '@/lib/completion-readiness'

type Client = Awaited<ReturnType<typeof createClient>>

export interface CompletionFeatures {
  schedule: boolean
  walkthroughs: boolean
  documents: boolean
  e_signatures: boolean
  invoices: boolean
  warranty: boolean
}

export interface CompletionReviewRecord {
  id: string
  outcome: 'ready' | 'with_exceptions'
  completion_date: string
  from_status: string
  note: string | null
  approved_by: string
  approved_at: string
  blocker_count: number
  exception_count: number
}

export interface CompletionExceptionRecord {
  id: string
  requirement_key: string
  requirement_label: string
  requirement_detail: string | null
  reason: string
  justification: string
  follow_up_user_id: string
  target_resolution_date: string | null
  evidence_reference: string | null
  approved_by: string
  approved_at: string
  status: 'open' | 'resolved'
  resolved_by: string | null
  resolved_at: string | null
  resolution_note: string | null
}

export type CompletionRecord =
  /** The readiness migration has not been applied yet. */
  | { availability: 'unavailable' }
  | { availability: 'ready'; review: CompletionReviewRecord | null; exceptions: CompletionExceptionRecord[] }

const AWAITING_SIGNATURE = ['awaiting_signatures', 'partially_signed']

export async function loadCompletionReadiness(
  supabase: Client,
  projectId: string,
  features: CompletionFeatures,
  canSeeFinancials: boolean,
): Promise<ReadinessSummary> {
  const [activitiesRes, issuesRes, finalRes, clientsRes, signaturesRes, invoicesRes, changeOrdersRes] = await Promise.all([
    supabase.from('schedule_activities').select('status, activity_type').eq('project_id', projectId),
    supabase.from('project_issues').select('id', { count: 'exact', head: true }).eq('project_id', projectId).in('status', ['open', 'in_progress']),
    features.walkthroughs
      ? supabase.from('walkthroughs').select('id').eq('project_id', projectId).eq('walkthrough_type', 'final').eq('status', 'submitted')
      : Promise.resolve({ data: [] as { id: string }[] }),
    supabase.from('project_clients').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
    features.documents && features.e_signatures
      ? supabase.from('signature_requests').select('id', { count: 'exact', head: true }).eq('project_id', projectId).in('status', AWAITING_SIGNATURE)
      : Promise.resolve({ count: 0 }),
    canSeeFinancials && features.invoices
      ? supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('project_id', projectId).in('status', ['issued', 'partially_paid'])
      : Promise.resolve({ count: null }),
    canSeeFinancials && features.invoices
      ? supabase.from('change_orders').select('id', { count: 'exact', head: true }).eq('project_id', projectId).in('status', ['internal_review', 'awaiting_homeowner'])
      : Promise.resolve({ count: null }),
  ])

  const activities = (activitiesRes.data ?? []).filter((a) => a.status !== 'skipped')
  const inspections = activities.filter((a) => a.activity_type === 'inspection')
  const finalIds = (finalRes.data ?? []).map((w) => w.id)

  let latestFinalSignoff: ReadinessFacts['latestFinalSignoff'] = null
  let homeownerAcknowledged = false
  if (finalIds.length > 0) {
    const { data: reports } = await supabase.from('walkthrough_reports').select('id').in('walkthrough_id', finalIds)
    const reportIds = (reports ?? []).map((r) => r.id)
    if (reportIds.length > 0) {
      const [signoffRes, ackRes] = await Promise.all([
        supabase.from('report_builder_signoffs').select('decision').in('report_id', reportIds).order('created_at', { ascending: false }).limit(1),
        supabase.from('report_acknowledgments').select('id', { count: 'exact', head: true }).in('report_id', reportIds).in('decision', ['acknowledged', 'accepted']),
      ])
      const decision = signoffRes.data?.[0]?.decision
      latestFinalSignoff = decision === 'verified' || decision === 'rejected' ? decision : null
      homeownerAcknowledged = (ackRes.count ?? 0) > 0
    }
  }

  return evaluateCompletionReadiness(
    {
      features,
      scheduleActivityCount: activities.length,
      scheduleIncompleteCount: activities.filter((a) => a.activity_type !== 'inspection' && a.status !== 'completed').length,
      inspectionCount: inspections.length,
      inspectionsOutstandingCount: inspections.filter((a) => a.status !== 'completed').length,
      openPunchItemCount: issuesRes.count ?? 0,
      finalWalkthroughSubmitted: finalIds.length > 0,
      latestFinalSignoff,
      homeownerAcknowledged,
      homeownerCount: clientsRes.count ?? 0,
      pendingSignatureCount: signaturesRes.count ?? 0,
      outstandingInvoiceCount: invoicesRes.count ?? null,
      pendingChangeOrderCount: changeOrdersRes.count ?? null,
    },
    projectId,
  )
}

export async function loadCompletionRecord(supabase: Client, projectId: string): Promise<CompletionRecord> {
  const [reviewRes, exceptionsRes] = await Promise.all([
    supabase
      .from('project_completion_reviews')
      .select('id, outcome, completion_date, from_status, note, approved_by, approved_at, blocker_count, exception_count')
      .eq('project_id', projectId)
      .maybeSingle(),
    supabase
      .from('project_completion_exceptions')
      .select('id, requirement_key, requirement_label, requirement_detail, reason, justification, follow_up_user_id, target_resolution_date, evidence_reference, approved_by, approved_at, status, resolved_by, resolved_at, resolution_note')
      .eq('project_id', projectId)
      .order('approved_at'),
  ])
  // PGRST205 / 42P01: table missing because the migration is not applied yet.
  if (reviewRes.error || exceptionsRes.error) return { availability: 'unavailable' }
  return {
    availability: 'ready',
    review: (reviewRes.data as CompletionReviewRecord | null) ?? null,
    exceptions: (exceptionsRes.data ?? []) as CompletionExceptionRecord[],
  }
}
