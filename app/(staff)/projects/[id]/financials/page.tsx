import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { Landmark } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { BASELINE_REASON_LABELS, formatMoney, type Baseline, type BudgetSummary } from '@/lib/financials'
import { loadProjectFinancials } from '@/lib/job-costing-data'
import { BUDGET_COLUMNS_COOKIE, parseBudgetColumns } from '@/lib/budget-columns'
import { PageHeader, Surface } from '@/components/shared/page-header'
import { SemanticBadge } from '@/components/shared/semantic-badge'
import { FinancialSummary } from '@/components/financials/financial-summary'
import { BudgetCosts } from '@/components/financials/budget-costs'
import { FinancialsNav, parseFinancialsView } from '@/components/financials/financials-nav'
import { ProjectInvoicesPanel } from '@/components/invoices/project-invoices-panel'

export const metadata: Metadata = { title: 'Project financials' }

export default async function ProjectFinancialsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ view?: string | string[] }>
}) {
  const session = await requireManager()
  const features = await requireFeature(session.organizationId, 'estimates')
  const [{ id }, { view: rawView }] = await Promise.all([params, searchParams])
  const view = parseFinancialsView(rawView, features.invoices)
  const supabase = await createClient()

  const [{ data: project }, { data: canViewInternal }] = await Promise.all([
    supabase.from('projects').select('id, name').eq('id', id).eq('organization_id', session.organizationId).maybeSingle(),
    supabase.rpc('can_view_project_internal', { p_project: id }),
  ])
  if (!project || !canViewInternal) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Financials" icon={Landmark} titleAddon={<SemanticBadge tone="neutral">Internal only</SemanticBadge>} />
      <FinancialsNav projectId={project.id} current={view} invoicesEnabled={features.invoices} />

      {view === 'invoices' ? (
        <ProjectInvoicesPanel projectId={project.id} canManage />
      ) : (
        <FinancialsBody
          view={view}
          project={project}
          showProfit={session.role === 'org_admin'}
          changeOrdersEnabled={features.change_orders}
        />
      )}
    </div>
  )
}

async function FinancialsBody({
  view,
  project,
  showProfit,
  changeOrdersEnabled,
}: {
  view: 'summary' | 'budget'
  project: { id: string; name: string }
  showProfit: boolean
  changeOrdersEnabled: boolean
}) {
  const [{ baseline, budget, summary, sources }, cookieStore] = await Promise.all([loadProjectFinancials(project.id), cookies()])

  return (
    <>
      <BaselineNote projectId={project.id} baseline={baseline} budget={budget} trackingAvailable={summary.costTrackingAvailable} changeOrdersEnabled={changeOrdersEnabled} />
      {view === 'summary' ? (
        <FinancialSummary summary={summary} showProfit={showProfit} />
      ) : (
        <BudgetCosts
          key={project.id}
          projectName={project.name}
          summary={summary}
          sources={sources}
          initialColumns={parseBudgetColumns(cookieStore.get(BUDGET_COLUMNS_COOKIE)?.value)}
        />
      )}
    </>
  )
}

function BaselineNote({
  projectId,
  baseline,
  budget,
  trackingAvailable,
  changeOrdersEnabled,
}: {
  projectId: string
  baseline: Baseline
  budget: BudgetSummary
  trackingAvailable: boolean
  changeOrdersEnabled: boolean
}) {
  const base = `/projects/${encodeURIComponent(projectId)}`
  return (
    <Surface aria-label="Budget baseline">
      {baseline.state === 'established' ? (
        <p className="text-sm text-muted-foreground">
          Baseline: estimate <span className="font-medium text-foreground">{baseline.estimate.estimate_number || 'untitled'}</span> revision {baseline.estimate.revision}.{' '}
          {budget.approvedCount} approved change order{budget.approvedCount === 1 ? '' : 's'} applied.
          {budget.pendingCount > 0 && (
            <> {budget.pendingCount} pending ({formatMoney(budget.pendingCostAdjustmentsCents, { signed: true })} cost) not included until approved.</>
          )}
          {changeOrdersEnabled && (
            <>
              {' '}
              <Link href={`${base}/change-orders`} className="font-medium text-primary underline-offset-4 hover:underline">
                View change orders
              </Link>
            </>
          )}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Budget not established. {BASELINE_REASON_LABELS[baseline.reason]}{' '}
          <Link href={`${base}/estimates`} className="font-medium text-primary underline-offset-4 hover:underline">
            Open estimates
          </Link>
        </p>
      )}
      {!trackingAvailable && (
        <p className="text-sm text-muted-foreground">
          Commitments, vendor bills and vendor payments are not set up in this environment yet, so committed, actual cost, forecasts and profit are unavailable.
        </p>
      )}
    </Surface>
  )
}
