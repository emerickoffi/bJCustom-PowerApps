import { ActionCenter } from '@/components/dashboard/action-center'
import { CommandHeader } from '@/components/dashboard/command-header'
import { ComingUp } from '@/components/dashboard/coming-up'
import { FinancialKpis } from '@/components/dashboard/financial-kpis'
import { PipelineOverview } from '@/components/dashboard/pipeline-overview'
import { PriorityJobs, type PriorityJob } from '@/components/dashboard/priority-jobs'
import { RecentActivity } from '@/components/dashboard/recent-activity'
import { WarrantyRail } from '@/components/dashboard/warranty-rail'
import { isActionCategory } from '@/lib/action-items'
import { getActionItems } from '@/lib/attention-data'
import { buildComingUp, COMING_UP_DAYS, type ProposedStartInput } from '@/lib/coming-up'
import { getDashboardCardDetails } from '@/lib/dashboard-cards'
import type { DashboardSectionId } from '@/lib/dashboard-sections'
import { loadAgenda, loadProjectHealth, loadWarrantyOverview } from '@/lib/dashboard-workspace-data'
import { ACTIVE_PROJECT_STATUSES, type ProjectStatus } from '@/lib/domain'
import type { getOrgFeatures } from '@/lib/features'
import { getFinancialMetrics } from '@/lib/financial-metrics-data'
import { loadPortfolioSignals } from '@/lib/portfolio-data'
import type { PortfolioRow } from '@/lib/portfolio'
import { rankPriorityJobs, summarizeJob } from '@/lib/priority-jobs'
import { getProfileNames, PROJECT_SUMMARY_COLUMNS, type ProjectSummary } from '@/lib/queries'
import type { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

type ProjectRow = PortfolioRow & { name: string; progress_percent: number | null; proposed_start_date: string | null }

/** Owner / administrator Command Center. Every figure comes from the Phase 1 and Phase 2 services. */
export async function OwnerDashboard({
  session,
  features,
  query,
}: {
  session: Awaited<ReturnType<typeof requireStaff>>
  features: Awaited<ReturnType<typeof getOrgFeatures>>
  query: { actions?: string }
}) {
  const supabase = await createClient()
  const orgId = session.organizationId
  const selectedAction = isActionCategory(query.actions) ? query.actions : null

  const [projectsRes, activityRes, signals, agendaData, warranty, attention] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, status, progress_percent, updated_at, proposed_start_date')
      .eq('organization_id', orgId)
      .is('archived_at', null),
    supabase
      .from('client_activity')
      .select('id, activity_type, summary, created_at, client_id, clients(first_name, last_name)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(8),
    loadPortfolioSignals(orgId, session.userId, features.schedule),
    loadAgenda(orgId, features.schedule, COMING_UP_DAYS),
    loadWarrantyOverview(orgId, features.warranty),
    getActionItems(orgId, session.userId, { manager: true, features }),
  ])

  const rows = (projectsRes.data ?? []) as ProjectRow[]
  const activeIds = rows.filter((r) => ACTIVE_PROJECT_STATUSES.includes(r.status as ProjectStatus)).map((r) => r.id)
  const counts = rows.reduce<Partial<Record<ProjectStatus, number>>>((acc, r) => {
    const s = r.status as ProjectStatus
    acc[s] = (acc[s] ?? 0) + 1
    return acc
  }, {})

  const [health, financials] = await Promise.all([
    loadProjectHealth(orgId, session.userId, activeIds, features),
    getFinancialMetrics(orgId, {
      features,
      today: agendaData.today,
      signedAwaitingEstimateIds: new Set(
        attention.items.filter((i) => i.category === 'approvals' && i.entityType === 'estimate').map((i) => i.entityId),
      ),
    }),
  ])

  const priorityIds = rankPriorityJobs(rows, signals, health.byId)
  const { data: summaryData } = priorityIds.length
    ? await supabase.from('projects').select(PROJECT_SUMMARY_COLUMNS).eq('organization_id', orgId).in('id', priorityIds)
    : { data: [] }
  const summaries = new Map(((summaryData ?? []) as unknown as ProjectSummary[]).map((p) => [p.id, p]))
  const ordered = priorityIds.flatMap((id) => summaries.get(id) ?? [])
  const [details, managers] = await Promise.all([
    getDashboardCardDetails(orgId, ordered, features),
    getProfileNames(ordered.map((p) => p.project_manager_id)),
  ])

  const budgets =
    financials.contracts.state === 'available'
      ? new Map(financials.contracts.value.projects.map((b) => [b.projectId, b]))
      : null
  const jobs: PriorityJob[] = ordered.map((p) => {
    const d = details.get(p.id)
    const h = health.byId.get(p.id) ?? null
    const budget = budgets?.get(p.id)
    return {
      id: p.id,
      name: p.name,
      projectNumber: p.project_number,
      status: p.status as ProjectStatus,
      managerName: p.project_manager_id ? (managers.get(p.project_manager_id) ?? null) : null,
      contractCents: budget?.state === 'established' ? budget.contractCents : null,
      health: h?.level ?? null,
      summary: summarizeJob({
        status: p.status as ProjectStatus,
        progressPercent: p.progress_percent,
        hasSchedule: d?.hasSchedule ?? false,
        nextActivity: d?.nextActivity ?? null,
        holdReason: d?.holdReason ?? null,
        warranty: d?.warranty ?? null,
        warrantyEnabled: features.warranty,
        health: h,
      }),
    }
  })

  const comingUp = buildComingUp({
    today: agendaData.today,
    agenda: agendaData.agenda.week,
    proposedStarts: rows as ProposedStartInput[],
    warranties: warranty.state === 'available' ? warranty.value.rows : [],
  })

  return (
    <div className="flex flex-col gap-6">
      <div data-dashboard-section={'welcome' satisfies DashboardSectionId}>
        <CommandHeader
          firstName={session.fullName?.split(' ')[0] ?? null}
          today={agendaData.today}
          actionTotal={attention.total}
          actionTotalIsLowerBound={attention.totalIsLowerBound}
          actionsAvailable={attention.unavailable.length === 0 || attention.total > 0}
        />
      </div>

      <section
        aria-label="Key figures"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        data-dashboard-section={'kpis' satisfies DashboardSectionId}
      >
        <FinancialKpis metrics={financials} scheduleRisk={health.scheduleRisk} />
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2.15fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <div data-dashboard-section={'attention' satisfies DashboardSectionId}>
            <ActionCenter
              items={attention.items}
              totalIsLowerBound={attention.totalIsLowerBound}
              unavailable={attention.unavailable}
              selected={selectedAction}
              limit={5}
              links={{
                href: (category) => (category ? `/dashboard?actions=${category}` : '/dashboard'),
                viewAll: selectedAction ? `/actions?category=${selectedAction}` : '/actions',
              }}
            />
          </div>
          <div className="hidden lg:block" data-dashboard-section={'priority_jobs' satisfies DashboardSectionId}>
            <PriorityJobs jobs={jobs} showBudget={budgets !== null} />
          </div>
        </div>

        <aside aria-label="Upcoming and recent" className="flex min-w-0 flex-col gap-6">
          <div data-dashboard-section={'coming_up' satisfies DashboardSectionId}>
            <ComingUp events={comingUp} days={COMING_UP_DAYS} scheduleEnabled={features.schedule} />
          </div>
          <div className="lg:hidden" data-dashboard-section={'priority_jobs' satisfies DashboardSectionId}>
            <PriorityJobs jobs={jobs} showBudget={budgets !== null} />
          </div>
          <div data-dashboard-section={'warranty' satisfies DashboardSectionId}>
            <WarrantyRail overview={warranty} />
          </div>
          <div data-dashboard-section={'recent_activity' satisfies DashboardSectionId}>
            <RecentActivity
              items={(activityRes.data ?? []) as unknown as Parameters<typeof RecentActivity>[0]['items']}
              updates={attention.updates}
              defaultOpen
              visibleLimit={5}
            />
          </div>
        </aside>
      </div>

      <div data-dashboard-section={'pipeline' satisfies DashboardSectionId}>
        <PipelineOverview counts={counts} />
      </div>
    </div>
  )
}
