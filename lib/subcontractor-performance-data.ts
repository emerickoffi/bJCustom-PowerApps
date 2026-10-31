import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isSubWorkSetupError } from '@/lib/subcontractor-work'
import { summarizePerformance, type PerformanceReview, type PerformanceSummary } from '@/lib/subcontractor-performance'

export type PerformanceAvailability = 'ready' | 'setup-required' | 'error'

const REVIEW_COLUMNS =
  'id, subcontractor_company_id, project_id, project_assignment_id, submission_id, quality, timeliness, communication, professionalism, issue_resolution, overall_rating, comments, revision, reviewed_by, updated_at'

function normalize(row: Record<string, unknown>): PerformanceReview {
  return { ...(row as unknown as PerformanceReview), overall_rating: Number(row.overall_rating) }
}

export async function loadPerformanceSummaries(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<{ availability: PerformanceAvailability; byCompany: Record<string, PerformanceSummary> }> {
  const { data, error } = await supabase
    .from('subcontractor_performance_reviews')
    .select('subcontractor_company_id, overall_rating, quality, timeliness, communication, professionalism, issue_resolution')
    .eq('organization_id', organizationId)
    .limit(10000)
  if (error) return { availability: isSubWorkSetupError(error) ? 'setup-required' : 'error', byCompany: {} }
  const grouped = new Map<string, PerformanceReview[]>()
  for (const row of data ?? []) {
    const r = normalize(row)
    grouped.set(r.subcontractor_company_id, [...(grouped.get(r.subcontractor_company_id) ?? []), r])
  }
  return {
    availability: 'ready',
    byCompany: Object.fromEntries([...grouped].map(([id, rows]) => [id, summarizePerformance(rows)])),
  }
}

export type VerifiedWorkOption = { id: string; projectId: string; label: string; acceptedAt: string | null }

export async function loadPerformanceDetail(supabase: SupabaseClient, organizationId: string, companyId: string) {
  const [reviewsRes, workRes] = await Promise.all([
    supabase
      .from('subcontractor_performance_reviews')
      .select(REVIEW_COLUMNS)
      .eq('organization_id', organizationId)
      .eq('subcontractor_company_id', companyId)
      .order('updated_at', { ascending: false })
      .limit(500),
    supabase
      .from('subcontractor_work_submissions')
      .select(
        'id, project_id, submission_kind, reviewed_at, assignment:schedule_activity_assignments(activity:schedule_activities(name)), issue:project_issues(item_label, category)',
      )
      .eq('organization_id', organizationId)
      .eq('subcontractor_company_id', companyId)
      .eq('status', 'accepted')
      .order('reviewed_at', { ascending: false })
      .limit(500),
  ])
  if (reviewsRes.error) {
    return {
      availability: (isSubWorkSetupError(reviewsRes.error) ? 'setup-required' : 'error') as PerformanceAvailability,
      reviews: [] as PerformanceReview[],
      summary: summarizePerformance([]),
      verifiedWork: [] as VerifiedWorkOption[],
    }
  }
  const reviews = (reviewsRes.data ?? []).map(normalize)
  type WorkRow = {
    id: string
    project_id: string
    submission_kind: 'work' | 'correction'
    reviewed_at: string | null
    assignment: { activity: { name: string } | null } | null
    issue: { item_label: string | null; category: string | null } | null
  }
  const verifiedWork: VerifiedWorkOption[] = ((workRes.data ?? []) as unknown as WorkRow[]).map((w) => ({
    id: w.id,
    projectId: w.project_id,
    acceptedAt: w.reviewed_at,
    label:
      w.submission_kind === 'work'
        ? w.assignment?.activity?.name ?? 'Schedule activity'
        : `Correction: ${w.issue?.item_label || w.issue?.category || 'Punch list item'}`,
  }))
  return {
    availability: 'ready' as PerformanceAvailability,
    reviews,
    summary: summarizePerformance(reviews),
    verifiedWork,
  }
}
