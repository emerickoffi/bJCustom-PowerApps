import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Landmark } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { BASELINE_REASON_LABELS, formatMoney } from '@/lib/financials'
import { loadProjectFinancials } from '@/lib/job-costing-data'
import { PageHeader, SectionHeading, Surface } from '@/components/shared/page-header'
import { FinancialSummary } from '@/components/financials/financial-summary'
import { BudgetTable } from '@/components/financials/budget-table'

export const metadata: Metadata = { title: 'Project financials' }

export default async function ProjectFinancialsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireManager()
  const features = await requireFeature(session.organizationId, 'estimates')
  const { id } = await params
  const supabase = await createClient()

  const [{ data: project }, { data: canViewInternal }] = await Promise.all([
    supabase.from('projects').select('id, name').eq('id', id).eq('organization_id', session.organizationId).maybeSingle(),
    supabase.rpc('can_view_project_internal', { p_project: id }),
  ])
  if (!project || !canViewInternal) notFound()

  const { baseline, budget, summary } = await loadProjectFinancials(project.id)
  const showProfit = session.role === 'org_admin'

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Financials"
        description={`Budget, cost, forecast and billing for ${project.name}. Internal only, never shown to homeowners.`}
        icon={Landmark}
      />

      <Surface aria-label="Budget baseline">
        {baseline.state === 'established' ? (
          <p className="text-sm text-muted-foreground">
            Baseline: estimate <span className="font-medium text-foreground">{baseline.estimate.estimate_number || 'untitled'}</span> revision {baseline.estimate.revision}.{' '}
            {budget.approvedCount} approved change order{budget.approvedCount === 1 ? '' : 's'} applied.
            {features.change_orders && (
              <>
                {' '}
                <Link href={`/projects/${encodeURIComponent(project.id)}/change-orders`} className="font-medium text-primary underline-offset-4 hover:underline">
                  View change orders
                </Link>
              </>
            )}
            {budget.pendingCount > 0 && (
              <>
                {' '}
                {budget.pendingCount} pending ({formatMoney(budget.pendingCostAdjustmentsCents, { signed: true })} cost) not included until approved.
              </>
            )}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {BASELINE_REASON_LABELS[baseline.reason]}{' '}
            <Link href={`/estimates?project=${encodeURIComponent(project.id)}`} className="font-medium text-primary underline-offset-4 hover:underline">
              Open estimates
            </Link>
          </p>
        )}
        {!summary.costTrackingAvailable && (
          <p className="text-sm text-muted-foreground">
            Commitments, vendor bills and vendor payments are not set up in this environment yet, so actual cost, forecasts and profit are not calculated.
          </p>
        )}
      </Surface>

      <FinancialSummary summary={summary} showProfit={showProfit} />

      <section aria-labelledby="budget-heading" className="flex flex-col gap-3">
        <SectionHeading id="budget-heading" title="Budget versus actual" description="Grouped by cost code. Estimate categories map to cost codes; historical labels are kept as recorded." />
        <BudgetTable summary={summary} />
      </section>
    </div>
  )
}
