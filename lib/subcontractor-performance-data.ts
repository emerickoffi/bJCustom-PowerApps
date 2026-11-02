import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isSubWorkSetupError } from '@/lib/subcontractor-work'
import { summarizePerformance, type PerformanceReview, type PerformanceSummary } from '@/lib/subcontractor-performance'

export type PerformanceAvailability = 'ready' | 'setup-required' | 'error'

const SCORE_COLUMNS = 'overall_rating, quality, schedule_reliability, communication, cleanliness, safety'
const REVIEW_COLUMNS = `id, subcontractor_company_id, project_id, project_assignment_id, reviewer_id, ${SCORE_COLUMNS}, comments, revision, created_at, updated_at, project:projects(name, project_number)`

export async function loadPerformanceSummaries(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<{ availability: PerformanceAvailability; byCompany: Record<string, PerformanceSummary> }> {
  const { data, error } = await supabase
    .from('subcontractor_ratings')
    .select(`subcontractor_company_id, ${SCORE_COLUMNS}`)
    .eq('organization_id', organizationId)
    .limit(10000)
  if (error) return { availability: isSubWorkSetupError(error) ? 'setup-required' : 'error', byCompany: {} }
  const grouped = new Map<string, PerformanceReview[]>()
  for (const row of (data ?? []) as unknown as PerformanceReview[]) {
    grouped.set(row.subcontractor_company_id, [...(grouped.get(row.subcontractor_company_id) ?? []), row])
  }
  return {
    availability: 'ready',
    byCompany: Object.fromEntries([...grouped].map(([id, rows]) => [id, summarizePerformance(rows)])),
  }
}

export async function loadPerformanceDetail(supabase: SupabaseClient, organizationId: string, companyId: string) {
  const { data, error } = await supabase
    .from('subcontractor_ratings')
    .select(REVIEW_COLUMNS)
    .eq('organization_id', organizationId)
    .eq('subcontractor_company_id', companyId)
    .order('updated_at', { ascending: false })
    .limit(500)
  if (error) {
    return {
      availability: (isSubWorkSetupError(error) ? 'setup-required' : 'error') as PerformanceAvailability,
      reviews: [] as PerformanceReview[],
      summary: summarizePerformance([]),
    }
  }
  const reviews = (data ?? []) as unknown as PerformanceReview[]
  return { availability: 'ready' as PerformanceAvailability, reviews, summary: summarizePerformance(reviews) }
}
