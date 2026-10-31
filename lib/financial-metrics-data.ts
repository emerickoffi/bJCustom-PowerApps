import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { ACTIVE_PROJECT_STATUSES } from '@/lib/domain'
import { isMissingTableError } from '@/lib/subcontractors'
import {
  available,
  classifyBudget,
  disabled,
  summarizeContracts,
  summarizeEstimates,
  summarizeReceivables,
  unavailable,
  type BudgetException,
  type ContractSummary,
  type CostTotals,
  type EstimateRow,
  type EstimateSummary,
  type Metric,
  type ReceivablesSummary,
} from '@/lib/financial-metrics'

/** Safety cap per source. Hitting it means totals could be incomplete, so the metric reports unavailable instead. */
const ROW_LIMIT = 5000

const n = (v: unknown) => Number(v ?? 0)

export type ProjectBudgetException = { projectId: string; projectName: string } & Extract<
  BudgetException,
  { state: 'verified_variance' | 'needs_review' }
>

export type FinancialMetrics = {
  estimates: Metric<EstimateSummary>
  contracts: Metric<ContractSummary>
  receivables: Metric<ReceivablesSummary>
  budgetExceptions: Metric<ProjectBudgetException[]>
}

type Features = { estimates: boolean; invoices: boolean; change_orders: boolean }

/**
 * Organization-wide financial figures for managers. Every read goes through RLS with the signed-in user's session;
 * callers must only invoke this for roles that may see company-wide financials (canManage).
 */
export async function getFinancialMetrics(
  orgId: string,
  options: { features: Features; today: string; signedAwaitingEstimateIds: ReadonlySet<string> },
): Promise<FinancialMetrics> {
  const { features, today } = options
  const supabase = await createClient()
  const skip = Promise.resolve(null)

  const [estimatesRes, changeOrdersRes, invoicesRes, projectsRes, commitmentsRes, billsRes] = await Promise.all([
    features.estimates
      ? supabase
          .from('estimates')
          .select(
            'id, project_id, family_id, revision, status, estimate_number, name, decision_at, direct_cost_cents, allowance_cents, contingency_cents, markup_cents, construction_total_cents, projects!inner(archived_at)',
          )
          .eq('organization_id', orgId)
          .is('projects.archived_at', null)
          .limit(ROW_LIMIT)
      : skip,
    features.change_orders
      ? supabase
          .from('change_orders')
          .select('id, project_id, status, cost_adjustment_cents, price_adjustment_cents')
          .eq('organization_id', orgId)
          .limit(ROW_LIMIT)
      : skip,
    features.invoices
      ? supabase
          .from('invoices')
          .select('id, status, due_date, total_cents, paid_cents')
          .eq('organization_id', orgId)
          .in('status', ['issued', 'partially_paid'])
          .limit(ROW_LIMIT)
      : skip,
    supabase
      .from('projects')
      .select('id, name')
      .eq('organization_id', orgId)
      .is('archived_at', null)
      .in('status', ACTIVE_PROJECT_STATUSES),
    supabase.from('project_commitments').select('project_id, amount_cents').eq('organization_id', orgId).eq('status', 'approved').limit(ROW_LIMIT),
    supabase.from('vendor_bills').select('project_id, amount_cents').eq('organization_id', orgId).eq('status', 'approved').limit(ROW_LIMIT),
  ])

  const truncated = (r: { data: unknown[] | null } | null) => (r?.data?.length ?? 0) >= ROW_LIMIT

  const estimateRows: EstimateRow[] | null =
    estimatesRes && !estimatesRes.error && !truncated(estimatesRes)
      ? (estimatesRes.data ?? []).map((e) => ({
          id: e.id,
          project_id: e.project_id,
          family_id: e.family_id,
          revision: n(e.revision),
          status: e.status,
          estimate_number: e.estimate_number,
          name: e.name,
          decision_at: e.decision_at,
          direct_cost_cents: n(e.direct_cost_cents),
          allowance_cents: n(e.allowance_cents),
          contingency_cents: n(e.contingency_cents),
          markup_cents: n(e.markup_cents),
          construction_total_cents: n(e.construction_total_cents),
        }))
      : null

  const estimates: Metric<EstimateSummary> = !features.estimates
    ? disabled('Estimates module is off')
    : estimateRows
      ? available(summarizeEstimates(estimateRows, options.signedAwaitingEstimateIds))
      : unavailable('Estimates could not be loaded')

  const changeOrdersReadable = !features.change_orders || (!!changeOrdersRes && !changeOrdersRes.error && !truncated(changeOrdersRes))
  const activeProjects = projectsRes.error ? null : (projectsRes.data ?? [])
  let contractSummary: ContractSummary | null = null
  if (features.estimates && estimateRows && changeOrdersReadable && activeProjects) {
    const changeOrders = (changeOrdersRes?.data ?? []).map((c) => ({
      id: c.id,
      project_id: c.project_id,
      status: c.status,
      cost_adjustment_cents: n(c.cost_adjustment_cents),
      price_adjustment_cents: n(c.price_adjustment_cents),
    }))
    contractSummary = summarizeContracts(
      activeProjects.map((p) => ({
        projectId: p.id,
        estimates: estimateRows.filter((e) => e.project_id === p.id),
        changeOrders: changeOrders.filter((c) => c.project_id === p.id),
      })),
    )
  }
  const contracts: Metric<ContractSummary> = !features.estimates
    ? disabled('Estimates module is off')
    : contractSummary
      ? available(contractSummary)
      : unavailable('Contract records could not be loaded')

  const receivables: Metric<ReceivablesSummary> = !features.invoices
    ? disabled('Invoices module is off')
    : invoicesRes && !invoicesRes.error && !truncated(invoicesRes)
      ? available(
          summarizeReceivables(
            (invoicesRes.data ?? []).map((i) => ({
              id: i.id,
              status: i.status,
              due_date: i.due_date,
              total_cents: n(i.total_cents),
              paid_cents: n(i.paid_cents),
            })),
            today,
          ),
        )
      : unavailable('Invoices could not be loaded')

  const costTrackingMissing = isMissingTableError(commitmentsRes.error) || isMissingTableError(billsRes.error)
  const costTrackingReadable = !costTrackingMissing && !commitmentsRes.error && !billsRes.error && !truncated(commitmentsRes) && !truncated(billsRes)
  let budgetExceptions: Metric<ProjectBudgetException[]>
  if (!contractSummary) {
    budgetExceptions = contracts.state === 'disabled' ? contracts : unavailable('Budget baselines could not be loaded')
  } else if (!costTrackingMissing && !costTrackingReadable) {
    budgetExceptions = unavailable('Cost records could not be loaded')
  } else {
    const totals = new Map<string, CostTotals>()
    const bump = (projectId: string, key: keyof CostTotals, cents: number) => {
      const t = totals.get(projectId) ?? { actualCents: 0, committedCents: 0 }
      t[key] += cents
      totals.set(projectId, t)
    }
    for (const b of billsRes.data ?? []) bump(b.project_id, 'actualCents', n(b.amount_cents))
    for (const c of commitmentsRes.data ?? []) bump(c.project_id, 'committedCents', n(c.amount_cents))
    const names = new Map((activeProjects ?? []).map((p) => [p.id, p.name as string]))
    budgetExceptions = available(
      contractSummary.projects.flatMap((p) => {
        const costs = costTrackingMissing ? null : (totals.get(p.projectId) ?? { actualCents: 0, committedCents: 0 })
        const result = classifyBudget(p, costs)
        return result.state === 'verified_variance' || result.state === 'needs_review'
          ? [{ ...result, projectId: p.projectId, projectName: names.get(p.projectId) ?? 'Project' }]
          : []
      }),
    )
  }

  return { estimates, contracts, receivables, budgetExceptions }
}
