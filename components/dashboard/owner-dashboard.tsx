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
import {
  buildComingUp,
  COMING_UP_DAYS,
  COMING_UP_RANGE_DAYS,
  DEFAULT_COMING_UP_RANGE,
  parseComingUpRange,
  type ComingUpRange,
  type ProposedStartInput,
} from '@/lib/coming-up'
import { getDashboardCardDetails } from '@/lib/dashboard-cards'
import type { DashboardSectionId } from '@/lib/dashboard-sections'
import { kpiGridClass, resolveVisibility } from '@/lib/dashboard-visibility'
import { getDashboardVisibility } from '@/lib/dashboard-visibility-data'
import { cn } from '@/lib/utils'
import { loadAgenda, loadProjectHealth, loadWarrantyOverview } from '@/lib/dashboard-workspace-data'
import { ACTIVE_PROJECT_STATUSES, type ProjectStatus } from '@/lib/domain'
import type { getOrgFeatures } from '@/lib/features'
import { getFinancialMetrics } from '@/lib/financial-metrics-data'
import { loadPortfolioSignals } from '@/lib/portfolio-data'
import type { PortfolioRow } from '@/lib/portfolio'
import { rankPriorityJobs, summarizeJob } from '@/lib/priority-jobs'
import { getProfileNames, PROJECT_SUMMARY_COLUMNS, type ProjectSummary } from '@/lib/queries'
import { canManage, type requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

type ProjectRow = PortfolioRow & { name: string; progress_percent: number | null; proposed_start_date: string | null }

/** Owner / administrator Command Center. Every figure comes from the Phase 1 and Phase 2 services. */
const PRIORITY_JOBS_ANCHOR = 'priority-jobs-anchor'

export async function OwnerDashboard({
  session,
  features,
  query,
}: {
  session: Awaited<ReturnType<typeof requireStaff>>
  features: Awaited<ReturnType<typeof getOrgFeatures>>
  query: { actions?: string; agenda?: string }
}) {
  const supabase = await createClient()
  const orgId = session.organizationId
  const selectedAction = isActionCategory(query.actions) ? query.actions : null
  const agendaRange = parseComingUpRange(query.agenda)
  const dashboardHref = (params: { actions?: string | null; agenda?: ComingUpRange }) => {
    const search = new URLSearchParams()
    if (params.actions) search.set('actions', params.actions)
    if (params.agenda && params.agenda !== DEFAULT_COMING_UP_RANGE) search.set('agenda', params.agenda)
    const qs = search.toString()
    return qs ? `/dashboard?${qs}` : '/dashboard'
  }

  const [projectsRes, activityRes, signals, agendaData, warranty, attention, visibilitySettings] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, status, progress_percent, updated_at, proposed_start_date')
      .eq('organization_id', orgId)
      .is('archived_at', null),
    supabase
      .from('client_activity')
      .select('id, activity_type, summary, created_at, client_id, clients(first_name, last_name)', { count: 'exact' })
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(8),
    loadPortfolioSignals(orgId, session.userId, features.schedule),
    loadAgenda(orgId, features.schedule, COMING_UP_DAYS),
    loadWarrantyOverview(orgId, features.warranty),
    getActionItems(orgId, session.userId, { manager: true, features }),
    getDashboardVisibility(orgId),
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

  /** Completed jobs stay listed only while a verified open action item is still attached to them. */
  const closeoutReasons = new Map<string, string>()
  for (const item of attention.items) {
    if (item.projectId && !closeoutReasons.has(item.projectId)) closeoutReasons.set(item.projectId, item.title)
  }
  const priorityEligible = rows.filter(
    (r) => r.status !== 'cancelled' && (r.status !== 'completed' || closeoutReasons.has(r.id)),
  )
  const priorityIds = rankPriorityJobs(priorityEligible, signals, health.byId)
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
      stageActivities: d?.stageActivities ?? null,
      closeoutReason: p.status === 'completed' ? (closeoutReasons.get(p.id) ?? null) : null,
      canSetUpSchedule: features.schedule && canManage(session.role),
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

  const activityTotal = activityRes.error ? null : (activityRes.count ?? null)

  const assigneeNames = await getProfileNames(agendaData.activities.map((a) => a.assigned_to ?? null))
  const comingUp = buildComingUp({
    today: agendaData.today,
    days: COMING_UP_RANGE_DAYS[agendaRange],
    activities: agendaData.activities,
    proposedStarts: rows as ProposedStartInput[],
    warranties: warranty.state === 'available' ? warranty.value.rows : [],
    assigneeNames,
  })

  const { estimates, contracts, receivables } = financials
  const scheduleRisk = health.scheduleRisk
  const attentionKnown = attention.unavailable.length === 0 || attention.items.length > 0
  const show = resolveVisibility(visibilitySettings.settings, {
    card_approval: {
      records: estimates.state === 'available' ? estimates.value.awaitingApproval.count > 0 : null,
      attention: null,
    },
    card_contract: {
      records: contracts.state === 'available' ? contracts.value.establishedCount > 0 : null,
      attention: null,
    },
    card_schedule: {
      records: scheduleRisk.state === 'available' ? scheduleRisk.value.total > 0 : null,
      attention: scheduleRisk.state === 'available' ? scheduleRisk.value.atRisk > 0 : null,
    },
    card_receivables: {
      records: receivables.state === 'available' ? receivables.value.outstandingCount > 0 : null,
      attention: receivables.state === 'available' ? receivables.value.overdueCount > 0 : null,
    },
    attention: {
      records: attentionKnown ? attention.items.length > 0 : null,
      attention: attention.items.some((i) => i.severity === 'critical') ? true : attentionKnown ? false : null,
    },
    priority_jobs: {
      records: projectsRes.error ? null : jobs.length > 0,
      attention: projectsRes.error
        ? null
        : jobs.some((j) => j.health === 'at_risk' || j.health === 'needs_attention'),
    },
    coming_up: { records: comingUp.length > 0, attention: null },
    warranty: {
      records: warranty.state === 'available' ? warranty.value.rows.length > 0 : warranty.state === 'disabled' ? false : null,
      attention:
        warranty.state === 'available'
          ? warranty.value.rows.some((w) => w.openClaims > 0)
          : warranty.state === 'disabled'
            ? false
            : null,
    },
    recent_activity: {
      records: activityRes.error ? null : (activityRes.data?.length ?? 0) + attention.updates.length > 0,
      attention: null,
    },
    pipeline: { records: projectsRes.error ? null : rows.length > 0, attention: null },
  })

  const kpiCards = new Set(
    (['card_approval', 'card_contract', 'card_schedule', 'card_receivables'] as const).filter((id) => show[id]),
  )
  const hasMainColumn = show.attention || show.priority_jobs
  const hasRail = show.coming_up || show.warranty || show.recent_activity
  const splitPriorityJobs = show.priority_jobs && hasRail

  return (
    <div className="flex flex-col gap-6">
      <div data-dashboard-section={'welcome' satisfies DashboardSectionId}>
        <CommandHeader
          firstName={session.fullName?.split(' ')[0] ?? null}
          today={agendaData.today}
          actionTotal={attention.total}
          actionTotalIsLowerBound={attention.totalIsLowerBound}
          actionsAvailable={attention.unavailable.length === 0 || attention.total > 0}
          actionsHref={show.attention ? '#action-center-heading' : '/actions'}
        />
      </div>

      {kpiCards.size > 0 && (
        <section
          aria-label="Key figures"
          className={kpiGridClass(kpiCards.size)}
          data-dashboard-section={'kpis' satisfies DashboardSectionId}
        >
          <FinancialKpis metrics={financials} scheduleRisk={scheduleRisk} visible={kpiCards} />
        </section>
      )}

      {(hasMainColumn || hasRail) && (
      <div
        className={cn(
          'grid items-start gap-6',
          hasMainColumn && hasRail && 'lg:grid-cols-[minmax(0,2.15fr)_minmax(0,1fr)]',
        )}
      >
        {hasMainColumn && (
        <div className="flex min-w-0 flex-col gap-6">
          {show.attention && (
          <div data-dashboard-section={'attention' satisfies DashboardSectionId}>
            <ActionCenter
              items={attention.items}
              totalIsLowerBound={attention.totalIsLowerBound}
              unavailable={attention.unavailable}
              selected={selectedAction}
              limit={5}
              links={{
                href: (category) => dashboardHref({ actions: category, agenda: agendaRange }),
                viewAll: selectedAction ? `/actions?category=${selectedAction}` : '/actions',
              }}
            />
          </div>
          )}
          {show.priority_jobs && (
          <div
            id={PRIORITY_JOBS_ANCHOR}
            className={cn(splitPriorityJobs && 'hidden lg:block')}
            data-dashboard-section={'priority_jobs' satisfies DashboardSectionId}
          >
            <PriorityJobs jobs={jobs} />
          </div>
          )}
        </div>
        )}

        {hasRail && (
        <aside aria-label="Upcoming and recent" className="flex min-w-0 flex-col gap-6">
          {show.coming_up && (
          <div data-dashboard-section={'coming_up' satisfies DashboardSectionId}>
            <ComingUp
              events={comingUp}
              range={agendaRange}
              hrefFor={(agenda) => dashboardHref({ actions: selectedAction, agenda })}
              scheduleEnabled={features.schedule}
            />
          </div>
          )}
          {splitPriorityJobs && (
          <div className="lg:hidden" data-dashboard-section={'priority_jobs' satisfies DashboardSectionId}>
            <PriorityJobs jobs={jobs} />
          </div>
          )}
          {show.warranty && (
          <div data-dashboard-section={'warranty' satisfies DashboardSectionId}>
            <WarrantyRail overview={warranty} />
          </div>
          )}
          {show.recent_activity && (
          <div data-dashboard-section={'recent_activity' satisfies DashboardSectionId}>
            <RecentActivity
              items={(activityRes.data ?? []) as unknown as Parameters<typeof RecentActivity>[0]['items']}
              updates={attention.updates}
              defaultOpen
              visibleLimit={2}
              total={activityTotal === null ? undefined : activityTotal + attention.updatesTotal}
              totalIsLowerBound={activityTotal === null || attention.updatesTotalIsLowerBound}
            />
          </div>
          )}
        </aside>
        )}
      </div>
      )}

      {show.pipeline && (
        <div data-dashboard-section={'pipeline' satisfies DashboardSectionId}>
          <PipelineOverview counts={counts} />
        </div>
      )}
    </div>
  )
}
