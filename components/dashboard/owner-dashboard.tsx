import { ActionCenter } from '@/components/dashboard/action-center'
import { DailyPriorities } from '@/components/dashboard/daily-priorities'
import { assembleBriefing, loadOverdueQuoteRequests, priorityAiAvailable } from '@/lib/ai/daily-priorities-server'
import { uncheckedSources } from '@/lib/daily-priorities'
import { CommandHeader } from '@/components/dashboard/command-header'
import { ComingUp } from '@/components/dashboard/coming-up'
import { FinancialKpis } from '@/components/dashboard/financial-kpis'
import { PipelineOverview } from '@/components/dashboard/pipeline-overview'
import { PriorityJobs, type PriorityJob, type PriorityJobGroup } from '@/components/dashboard/priority-jobs'
import { getStageNextSteps } from '@/lib/dashboard-cards'
import { nextStepDue } from '@/lib/next-step-due'
import { DUE_GROUP_LIMIT, groupByDue, isDueGroupId, type DueGroupId } from '@/lib/priority-job-groups'

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
import { RecentActivity } from '@/components/dashboard/recent-activity'
import { MyTodos } from '@/components/dashboard/my-todos'
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
import type { ReactNode } from 'react'
import type { KpiCardId } from '@/components/dashboard/financial-kpis'
import { kpiGridClass, resolveVisibility, type LayoutArea, type VisibilityItemId } from '@/lib/dashboard-visibility'
import { getDashboardVisibility } from '@/lib/dashboard-visibility-data'
import { cn } from '@/lib/utils'
import { loadAgenda, loadProjectHealth, loadWarrantyOverview } from '@/lib/dashboard-workspace-data'
import { ACTIVE_PROJECT_STATUSES, type ProjectStatus } from '@/lib/domain'
import type { getOrgFeatures } from '@/lib/features'
import { getFinancialMetrics } from '@/lib/financial-metrics-data'
import { taskUrgency } from '@/lib/tasks'
import { loadMyTasks } from '@/lib/tasks-data'
import { loadPortfolioSignals } from '@/lib/portfolio-data'
import type { PortfolioRow } from '@/lib/portfolio'
import { PRIORITY_JOBS_LIMIT, rankPriorityJobs, summarizeJob } from '@/lib/priority-jobs'
import { getProfileNames, PROJECT_SUMMARY_COLUMNS, type ProjectSummary } from '@/lib/queries'
import { canManage, type requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { WeatherStrip } from '@/components/dashboard/weather-strip'
import { readWeatherChoice, readWorkScope } from '@/lib/dashboard-prefs'
import { WorkScopeControl } from '@/components/dashboard/work-scope-control'
import { formatJobsiteAddress, type JobsiteAddress } from '@/lib/weather-data'
import { LayoutSwitch } from '@/components/app/layout-mode'
import { TabletHome } from '@/components/dashboard/tablet-home'
import { TabletJobFocus } from '@/components/dashboard/tablet-job-focus'
import { TabletMyDay } from '@/components/dashboard/tablet-my-day'
import { getProjectCoverPhotos } from '@/lib/project-photos'
import { buildTabletShortcuts, parseTabletTab, tabletSections, type TabletTab } from '@/lib/tablet-home'
import { TabletShortcuts } from '@/components/dashboard/tablet-shortcuts'

type ProjectRow = PortfolioRow &
  JobsiteAddress & {
    name: string
    progress_percent: number | null
    proposed_start_date: string | null
  }

/** Owner / administrator Command Center. Every figure comes from the Phase 1 and Phase 2 services. */
const PRIORITY_JOBS_ANCHOR = 'priority-jobs-anchor'

export async function OwnerDashboard({
  session,
  features,
  query,
}: {
  session: Awaited<ReturnType<typeof requireStaff>>
  features: Awaited<ReturnType<typeof getOrgFeatures>>
  query: { actions?: string; agenda?: string; project?: string; tab?: string; jobs?: string }
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

  // Promise.resolve runs the query builder exactly once, so its result can feed both the batch and the health load.
  const projectsPromise = Promise.resolve(
    supabase
      .from('projects')
      .select(
        'id, name, status, progress_percent, updated_at, proposed_start_date, address_line1, city, state, postal_code, country',
      )
      .eq('organization_id', orgId)
      .is('archived_at', null),
  )
  // Health only needs the project list, so it overlaps the slower action-item load instead of waiting behind it.
  const healthPromise = projectsPromise.then((res) =>
    loadProjectHealth(
      orgId,
      session.userId,
      ((res.data ?? []) as ProjectRow[])
        .filter((r) => ACTIVE_PROJECT_STATUSES.includes(r.status as ProjectStatus))
        .map((r) => r.id),
      features,
    ),
  )
  // Awaited below; this only keeps an early rejection from being reported as unhandled meanwhile.
  healthPromise.catch(() => undefined)

  const agendaPromise = loadAgenda(orgId, features.schedule, COMING_UP_DAYS)
  const tasksPromise = agendaPromise.then((a) => loadMyTasks(orgId, session.userId, a.today))

  const [
    projectsRes,
    activityRes,
    signals,
    agendaData,
    warranty,
    allAttention,
    visibilitySettings,
    weatherChoice,
    workScope,
    myTasks,
    overdueQuoteRequests,
  ] = await Promise.all([
      projectsPromise,
      supabase
        .from('client_activity')
        .select(
          'id, activity_type, summary, created_at, client_id, created_by, project_id, clients(first_name, last_name), projects(name)',
          { count: 'exact' },
        )
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(8),
      loadPortfolioSignals(orgId, session.userId, features.schedule),
      agendaPromise,
      loadWarrantyOverview(orgId, features.warranty),
      getActionItems(orgId, session.userId, { manager: true, features }),
      getDashboardVisibility(orgId),
      readWeatherChoice(session.userId, orgId),
      readWorkScope(session.userId),
      tasksPromise,
      loadOverdueQuoteRequests(orgId, Boolean(features.subcontractors)),
    ])

  /** My work keeps only items explicitly assigned to the signed-in user; the header count follows the same scope. */
  const mine = workScope === 'mine'
  const scopedItems = mine ? allAttention.items.filter((i) => i.responsibleUserId === session.userId) : allAttention.items
  const attention = mine
    ? { ...allAttention, items: scopedItems, total: scopedItems.length, totalIsLowerBound: false }
    : allAttention

  const rows = (projectsRes.data ?? []) as ProjectRow[]
  const dueTodayCount =
    myTasks.state === 'available'
      ? myTasks.open.filter((t) => taskUrgency(t.dueDate, agendaData.today) === 'today').length
      : 0
  const counts = rows.reduce<Partial<Record<ProjectStatus, number>>>((acc, r) => {
    const s = r.status as ProjectStatus
    acc[s] = (acc[s] ?? 0) + 1
    return acc
  }, {})

  const priorityStatusRows = rows
    .filter((r) => r.status !== 'cancelled')
    .map((r) => ({ id: r.id, status: r.status as ProjectStatus }))
  const [health, financials, stageNext] = await Promise.all([
    healthPromise,
    getFinancialMetrics(orgId, {
      features,
      today: agendaData.today,
      signedAwaitingEstimateIds: new Set(
        attention.items.filter((i) => i.category === 'approvals' && i.entityType === 'estimate').map((i) => i.entityId),
      ),
    }),
    getStageNextSteps(orgId, priorityStatusRows, features.schedule, agendaData.today),
  ])

  /** Completed jobs stay listed only while a verified open action item is still attached to them. */
  const closeoutReasons = new Map<string, string>()
  /** The same item's own deadline. The project-schedule item's date is a proposed start, not a deadline, so it is omitted. */
  const closeoutDueOn = new Map<string, string | null>()
  const closeoutHref = new Map<string, string>()
  for (const item of attention.items) {
    if (item.projectId && !closeoutReasons.has(item.projectId)) {
      closeoutReasons.set(item.projectId, item.title)
      closeoutHref.set(item.projectId, item.href)
      closeoutDueOn.set(item.projectId, item.id.startsWith('project-schedule:') ? null : item.dueDate)
    }
  }
  const priorityEligible = rows.filter(
    (r) => r.status !== 'cancelled' && (r.status !== 'completed' || closeoutReasons.has(r.id)),
  )
  /** Full risk ranking; the tablet keeps its top slice, and the dashboard card uses it to break ties within a due group. */
  const fullRank = rankPriorityJobs(priorityEligible, signals, health.byId, priorityEligible.length)
  const priorityIds = fullRank.slice(0, PRIORITY_JOBS_LIMIT)

  /** Group counts cover every eligible project, before any display limit. */
  const dueItems = priorityEligible.map((r) => {
    const completed = r.status === 'completed'
    return {
      id: r.id,
      due: nextStepDue({
        closeoutReason: completed ? (closeoutReasons.get(r.id) ?? null) : null,
        closeoutDueOn: completed ? (closeoutDueOn.get(r.id) ?? null) : null,
        stageActivities: stageNext.get(r.id) ?? null,
      }),
    }
  })
  const { groups: dueGroups, laterCount } = groupByDue(dueItems, fullRank, agendaData.today)
  const expandedGroup = isDueGroupId(query.jobs) ? query.jobs : null
  const visibleByGroup = new Map(
    dueGroups.map((g) => [g.id, g.id === expandedGroup ? g.ids : g.ids.slice(0, DUE_GROUP_LIMIT)]),
  )

  /** Tablet project scope. Only an id from this organization's open projects is honoured; never a default pick. */
  const selectedRow = query.project ? (rows.find((r) => r.id === query.project) ?? null) : null
  const summaryIds = [
    ...new Set([...priorityIds, ...[...visibleByGroup.values()].flat(), ...(selectedRow ? [selectedRow.id] : [])]),
  ]
  const summaryResults = await Promise.all(
    chunk(summaryIds, 100).map((ids) =>
      supabase.from('projects').select(PROJECT_SUMMARY_COLUMNS).eq('organization_id', orgId).in('id', ids),
    ),
  )
  const summaryError = summaryResults.find((r) => r.error)?.error ?? null
  const summaries = new Map(
    summaryResults.flatMap((r) => (r.data ?? []) as unknown as ProjectSummary[]).map((p) => [p.id, p]),
  )
  const ordered = priorityIds.flatMap((id) => summaries.get(id) ?? [])
  const withSelected = summaryIds.flatMap((id) => summaries.get(id) ?? [])
  const tabletJobIds = [...priorityIds.slice(0, 4), ...(selectedRow ? [selectedRow.id] : [])]
  const [detailChunks, managers, covers] = await Promise.all([
    Promise.all(chunk(withSelected, 8).map((part) => getDashboardCardDetails(orgId, part, features, agendaData.today))),
    getProfileNames(withSelected.map((p) => p.project_manager_id)),
    getProjectCoverPhotos(tabletJobIds),
  ])
  const details = new Map(detailChunks.flatMap((m) => [...m]))

  const budgets =
    financials.contracts.state === 'available'
      ? new Map(financials.contracts.value.projects.map((b) => [b.projectId, b]))
      : null
  const toJob = (p: ProjectSummary): PriorityJob => {
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
      healthReasons: h?.reasons,
      stageActivities: stageNext.has(p.id) ? (stageNext.get(p.id) ?? null) : (d?.stageActivities ?? null),
      closeoutReason: p.status === 'completed' ? (closeoutReasons.get(p.id) ?? null) : null,
      closeoutDueOn: p.status === 'completed' ? (closeoutDueOn.get(p.id) ?? null) : null,
      closeoutHref: p.status === 'completed' ? (closeoutHref.get(p.id) ?? null) : null,
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
  }
  const jobs: PriorityJob[] = ordered.map(toJob)
  const groupHref = (group: DueGroupId | null) => {
    const search = new URLSearchParams()
    if (selectedAction) search.set('actions', selectedAction)
    if (agendaRange !== DEFAULT_COMING_UP_RANGE) search.set('agenda', agendaRange)
    if (group) search.set('jobs', group)
    const qs = search.toString()
    return `/dashboard${qs ? `?${qs}` : ''}#${PRIORITY_JOBS_ANCHOR}`
  }
  const jobGroups: PriorityJobGroup[] = dueGroups.map((g) => ({
    id: g.id,
    total: g.ids.length,
    jobs: (visibleByGroup.get(g.id) ?? []).flatMap((id) => {
      const s = summaries.get(id)
      return s ? [toJob(s)] : []
    }),
    expanded: g.id === expandedGroup,
    showAllHref: groupHref(g.id),
    showFewerHref: groupHref(null),
  }))
  const selectedSummary = selectedRow ? summaries.get(selectedRow.id) : undefined

  const activityTotal = activityRes.error ? null : (activityRes.count ?? null)

  type ActivityRow = { created_by: string | null }
  const activityRows = (activityRes.data ?? []) as unknown as ActivityRow[]
  const [assigneeNames, actorNames] = await Promise.all([
    getProfileNames(agendaData.activities.map((a) => a.assigned_to ?? null)),
    getProfileNames(activityRows.map((a) => a.created_by)),
  ])
  const activityItems = activityRows.map((a) => ({
    ...a,
    actorName: a.created_by ? (actorNames.get(a.created_by) ?? 'Former team member') : 'System',
  }))
  const allComingUp = buildComingUp({
    today: agendaData.today,
    days: COMING_UP_RANGE_DAYS[agendaRange],
    activities: agendaData.activities,
    proposedStarts: rows as ProposedStartInput[],
    warranties: warranty.state === 'available' ? warranty.value.rows : [],
    assigneeNames,
  })
  const comingUp = mine ? allComingUp.filter((e) => e.responsibleUserId === session.userId) : allComingUp

  const { estimates, contracts, receivables } = financials
  const scheduleRisk = health.scheduleRisk
  const attentionKnown = attention.unavailable.length === 0 || attention.items.length > 0
  /** Authorized active projects; weather uses the structured jobsite address, never the client mailing address. */
  const weatherLocations = rows
    .filter((r) => ACTIVE_PROJECT_STATUSES.includes(r.status as ProjectStatus))
    .map((r) => ({ id: r.id, name: r.name, hasAddress: formatJobsiteAddress(r) !== null }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const weatherWidget = (compact: boolean) => (
    <WeatherStrip
      compact={compact}
      locations={weatherLocations}
      initialChoice={weatherChoice}
      canEditAddress={canManage(session.role)}
    />
  )
  const show = resolveVisibility(visibilitySettings.settings.visibility, {
    weather: {
      records: true,
      attention: null,
    },
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
      attention: projectsRes.error ? null : jobs.some((j) => j.health === 'at_risk' || j.health === 'needs_attention'),
    },
    coming_up: { records: comingUp.length > 0, attention: null },
    my_todos: {
      records: myTasks.state === 'available' ? myTasks.openCount > 0 : null,
      attention: myTasks.state === 'available' ? myTasks.overdueCount > 0 || dueTodayCount > 0 : null,
    },
    recent_activity: {
      records: activityRes.error ? null : (activityRes.data?.length ?? 0) + attention.updates.length > 0,
      attention: null,
    },
    pipeline: {
      records: projectsRes.error ? null : rows.length > 0,
      attention: null,
    },
  })

  const { layout } = visibilitySettings.settings
  const kpiOrder = layout.summary.filter((id): id is KpiCardId => id.startsWith('card_'))
  const kpiCards = new Set(kpiOrder.filter((id) => show[id]))

  const priorityContext = {
    orgId,
    userId: session.userId,
    manager: canManage(session.role),
    today: agendaData.today,
    scope: workScope,
    aiAvailable: priorityAiAvailable(features),
    inputs: {
      actionItems: attention.items,
      tasks: myTasks.state === 'available' ? myTasks.open : [],
      activities: agendaData.activities,
      quoteRequests: overdueQuoteRequests ?? [],
    },
    unchecked: uncheckedSources({
      modules: attention.unavailable.map((u) => u.module),
      tasksFailed: myTasks.state === 'unavailable',
      agendaFailed: !!agendaData.failed,
      quotesFailed: overdueQuoteRequests === null,
    }),
  }
  const [{ briefing: standardBriefing }, tabletBriefing] = await Promise.all([
    assembleBriefing({ ...priorityContext, projectId: null }),
    selectedRow ? assembleBriefing({ ...priorityContext, projectId: selectedRow.id }).then((r) => r.briefing) : null,
  ])

  const sections: Partial<Record<VisibilityItemId, ReactNode>> = {
    attention: (
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
        headerActions={<WorkScopeControl scope={workScope} />}
        priorities={<DailyPriorities initial={standardBriefing} viewAllHref="/actions" />}
      />
    ),
    priority_jobs: (
      <PriorityJobs
        groups={jobGroups}
        laterCount={laterCount}
        today={agendaData.today}
        unavailable={!!projectsRes.error || !!summaryError}
      />
    ),
    coming_up: (
      <ComingUp
        events={comingUp}
        today={agendaData.today}
        scopedToMe={mine}
        range={agendaRange}
        hrefFor={(agenda) => dashboardHref({ actions: selectedAction, agenda })}
        scheduleEnabled={features.schedule}
        headerAction={show.attention ? undefined : <WorkScopeControl scope={workScope} />}
      />
    ),
    my_todos: (
      <MyTodos
        open={myTasks.state === 'available' ? myTasks.open : []}
        openCount={myTasks.state === 'available' ? myTasks.openCount : 0}
        completed={myTasks.state === 'available' ? myTasks.completed : []}
        projects={rows.map((r) => ({ id: r.id, name: r.name }))}
        today={agendaData.today}
        unavailable={myTasks.state === 'unavailable'}
      />
    ),
    recent_activity: (
      <RecentActivity
        items={activityItems as unknown as Parameters<typeof RecentActivity>[0]['items']}
        updates={attention.updates}
        defaultOpen
        visibleLimit={3}
        total={activityTotal === null ? undefined : activityTotal + attention.updatesTotal}
        totalIsLowerBound={activityTotal === null || attention.updatesTotalIsLowerBound}
      />
    ),
    pipeline: <PipelineOverview counts={projectsRes.error ? null : counts} />,
  }
  /** Visible sections of an area, in saved order. Hidden items never reserve space. */
  const area = (key: LayoutArea) =>
    layout[key]
      .filter((id) => show[id] && sections[id])
      .map((id) => (
        <div
          key={id}
          id={id === 'priority_jobs' ? PRIORITY_JOBS_ANCHOR : undefined}
          className="min-w-0"
          data-dashboard-section={id}
        >
          {sections[id]}
        </div>
      ))
  const above = area('above')
  const main = area('main')
  const side = area('side')
  const below = area('below')

  /** Same scoped data as Standard, narrowed to the selected project when one is chosen. */
  const inProject = <T extends { projectId: string | null }>(list: T[]) =>
    selectedRow ? list.filter((x) => x.projectId === selectedRow.id) : list
  const tabletAttention = inProject(attention.items)
  const isShown = (id: VisibilityItemId) => Boolean(show[id])
  const tabletSection = (id: VisibilityItemId): ReactNode => {
    if (id === 'attention')
      return (
        <ActionCenter
          items={tabletAttention}
          totalIsLowerBound={!selectedRow && attention.totalIsLowerBound}
          unavailable={attention.unavailable}
          selected={selectedAction}
          limit={3}
          links={{
            href: (category) => {
              const search = new URLSearchParams()
              search.set('actions', category ?? '')
              if (selectedRow) search.set('project', selectedRow.id)
              return category ? `/dashboard?${search}` : selectedRow ? `/dashboard?project=${selectedRow.id}` : '/dashboard'
            },
            viewAll: selectedAction ? `/actions?category=${selectedAction}` : '/actions',
          }}
          priorities={<DailyPriorities initial={tabletBriefing ?? standardBriefing} viewAllHref="/actions" />}
        />
      )
    if (id === 'coming_up')
      return (
        <TabletMyDay
          events={inProject(comingUp)}
          today={agendaData.today}
          scopedToMe={mine}
          scheduleEnabled={features.schedule}
          agendaHref="/schedule"
        />
      )
    if (id === 'priority_jobs')
      return (
        <TabletJobFocus
          jobs={jobs}
          covers={covers}
          selected={selectedRow ? { name: selectedRow.name, job: selectedSummary ? toJob(selectedSummary) : null } : null}
        />
      )
    return sections[id] ?? null
  }
  const tabletPanel = (tab: TabletTab, lead?: ReactNode, emptyText?: string) => {
    const ids = tabletSections(layout, tab, isShown)
    const body = ids.map((id) => (
      <div key={id} className="min-w-0" data-dashboard-section={id}>
        {tabletSection(id)}
      </div>
    ))
    return (
      <div className="flex flex-col gap-4">
        {lead}
        {body.length > 0 ? (
          <div className={cn('grid items-start gap-4', body.length > 1 && 'min-[900px]:grid-cols-2')}>{body}</div>
        ) : (
          !lead && emptyText && <p className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">{emptyText}</p>
        )}
      </div>
    )
  }
  const scopeNote = selectedRow ? (
    <p className="text-sm text-muted-foreground">
      {'Showing '}
      <span className="font-medium text-foreground">{selectedRow.name}</span>
      {'. Choose All projects in the project selector to see everything.'}
    </p>
  ) : null

  const shortcuts = buildTabletShortcuts({
    role: session.role,
    features,
    project: selectedRow ? { id: selectedRow.id, name: selectedRow.name } : null,
  })
  const todayLead =
    shortcuts.length > 0 || show.attention || show.coming_up ? (
      <>
        <TabletShortcuts shortcuts={shortcuts} />
        {(show.attention || show.coming_up) && (
          <div className="flex justify-end">
            <WorkScopeControl scope={workScope} />
          </div>
        )}
      </>
    ) : undefined

  const tablet = (
    <div className="flex flex-col gap-4">
      <CommandHeader
        compact
        firstName={session.fullName?.split(' ')[0] ?? null}
        today={agendaData.today}
        actionTotal={attention.total}
        actionTotalIsLowerBound={attention.totalIsLowerBound}
        actionsAvailable={attention.unavailable.length === 0 || attention.total > 0}
        actionsHref={show.attention ? '#action-center-heading' : '/actions'}
        weather={show.weather ? weatherWidget(false) : null}
      />
      {scopeNote}
      <TabletHome
        initialTab={parseTabletTab(query.tab)}
        panels={{
          today: tabletPanel('today', todayLead),
          jobs: tabletPanel('jobs', undefined, 'Priority jobs are hidden in dashboard settings.'),
          overview: tabletPanel(
            'overview',
            kpiCards.size > 0 && (
              <section aria-label="Key figures" className={kpiGridClass(kpiCards.size)}>
                <FinancialKpis metrics={financials} scheduleRisk={scheduleRisk} visible={kpiCards} order={kpiOrder} />
              </section>
            ),
            'No overview sections are enabled in dashboard settings.',
          ),
        }}
      />
    </div>
  )

  const standard = (
    <div className="flex flex-col gap-6">
      <div data-dashboard-section={'welcome' satisfies DashboardSectionId}>
        <CommandHeader
          firstName={session.fullName?.split(' ')[0] ?? null}
          today={agendaData.today}
          actionTotal={attention.total}
          actionTotalIsLowerBound={attention.totalIsLowerBound}
          actionsAvailable={attention.unavailable.length === 0 || attention.total > 0}
          actionsHref={show.attention ? '#action-center-heading' : '/actions'}
          showAttention={!show.attention}
          weather={
            show.weather ? (
              weatherWidget(true)
            ) : null
          }
        />
      </div>

      <div className="flex flex-col gap-4">
        {kpiCards.size > 0 && (
          <section
            aria-label="Key figures"
            className={kpiGridClass(kpiCards.size)}
            data-dashboard-section={'kpis' satisfies DashboardSectionId}
          >
            <FinancialKpis metrics={financials} scheduleRisk={scheduleRisk} visible={kpiCards} order={kpiOrder} />
          </section>
        )}

        <div className="flex flex-col gap-6">
          {above.length > 0 && <div className="flex flex-col gap-6">{above}</div>}

          {(main.length > 0 || side.length > 0) && (
            <div
              className={cn(
                'grid items-start gap-6',
                main.length > 0 && side.length > 0 && 'lg:grid-cols-[minmax(0,2.15fr)_minmax(0,1fr)]',
              )}
            >
              {main.length > 0 && <div className="flex min-w-0 flex-col gap-6">{main}</div>}
              {side.length > 0 && (
                <aside aria-label="Side column" className="flex min-w-0 flex-col gap-6">
                  {side}
                </aside>
              )}
            </div>
          )}

          {below.length > 0 && <div className="flex flex-col gap-6">{below}</div>}
        </div>
      </div>
    </div>
  )

  return <LayoutSwitch standard={standard} tablet={tablet} />
}
