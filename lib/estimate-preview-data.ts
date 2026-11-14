import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { canManage, getSession } from '@/lib/session'
import { clientDisplayName, getEstimate } from '@/lib/estimate-queries'
import type { EstimatePreview } from '@/lib/estimate-preview'

type Result = { ok: true; preview: EstimatePreview } | { ok: false; status: number; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NOT_FOUND: Result = { ok: false, status: 404, error: 'This estimate is no longer available.' }
const FORBIDDEN: Result = { ok: false, status: 403, error: 'You do not have access to this estimate.' }

/**
 * One estimate's preview, loaded only when it is selected. Access matches the Estimates list and detail page:
 * active staff in the estimate's organization. Totals are the stored, server-computed values; nothing is recalculated.
 * Builder costs, markup and contingency are included only for roles that manage estimates.
 */
export async function loadEstimatePreview(estimateId: string): Promise<Result> {
  if (!UUID.test(estimateId)) return NOT_FOUND
  const session = await getSession()
  if (!session) return { ok: false, status: 401, error: 'Please sign in again.' }
  if (!session.organizationId || !session.role || session.role === 'client' || session.activationRequired) return FORBIDDEN

  const estimate = await getEstimate(estimateId, session.organizationId)
  if (!estimate) return NOT_FOUND

  const supabase = await createClient()
  const { count } = await supabase
    .from('estimates')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', session.organizationId)
    .eq('family_id', estimate.family_id)

  const internal = canManage(session.role)
    ? {
        directCostCents: estimate.direct_cost_cents,
        markupCents: estimate.markup_cents,
        markupPercent: Number(estimate.markup_percent) || 0,
        contingencyCents: estimate.contingency_cents,
        contingencyPercent: Number(estimate.contingency_percent) || 0,
      }
    : null

  return {
    ok: true,
    preview: {
      id: estimate.id,
      name: estimate.name,
      estimateNumber: estimate.estimate_number,
      revision: estimate.revision,
      revisionCount: Math.max(count ?? 1, 1),
      status: estimate.status,
      isDemo: estimate.is_demo,
      project: estimate.project
        ? { id: estimate.project.id, name: estimate.project.name, number: estimate.project.project_number || null }
        : null,
      client: estimate.client ? { id: estimate.client.id, name: clientDisplayName(estimate.client) ?? 'Client' } : null,
      constructionTotalCents: estimate.construction_total_cents,
      landCostCents: estimate.land_cost_cents,
      totalWithLandCents: estimate.total_with_land_cents,
      estimateDate: estimate.estimate_date ?? null,
      expirationDate: estimate.expiration_date,
      createdAt: estimate.created_at,
      updatedAt: estimate.updated_at ?? null,
      submittedAt: estimate.submitted_at,
      decisionAt: estimate.decision_at,
      decisionByName: estimate.decision_by_name,
      internal,
      href: `/estimates/${estimate.id}`,
      pdfHref: `/print/estimates/${estimate.id}`,
    },
  }
}
