import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, ClipboardList, Home, Hourglass, ShieldCheck, ShieldCheck as ShieldCheckIcon } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { requireStaff } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'
import { HeaderHelp, PageHeader, EmptyState, pageLayout } from '@/components/shared/page-header'
import { RunWarrantyButton } from '@/components/warranty/run-warranty-button'
import { WARRANTY_STAGE_LABELS, type WarrantyStage } from '@/components/warranty/stage'
import { NextMilestone } from '@/components/warranty/next-milestone'
import { cn } from '@/lib/utils'
import { SemanticBadge, type SemanticTone } from '@/components/shared/semantic-badge'
import { SummaryStrip, type SummaryStat } from '@/components/shared/summary-strip'
import { WorksheetFilters, worksheetResultsClass, type WorksheetFilter } from '@/components/shared/worksheet-filters'
import { WarrantyExportMenu } from '@/components/warranty/export-menu'
import { NewClaimMenu } from '@/components/warranty/new-claim-menu'
import {
  BUILDER_OWNED_STATUSES,
  EXPIRING_WINDOW_DAYS,
  SERVICE_RESPONSE_DAYS,
  addDaysIso,
  type ClaimStatus,
} from '@/lib/warranty-coverage'

export const metadata: Metadata = { title: 'Warranty' }

const STAGE_TONE: Record<WarrantyStage, SemanticTone> = {
  monitoring: 'success',
  completed: 'pending',
  ready_to_archive: 'info',
  archived: 'neutral',
}

const FILTERS: { value: WarrantyStage | 'all'; label: string }[] = [
  { value: 'all', label: 'All active' },
  { value: 'monitoring', label: 'Monitoring' },
  { value: 'completed', label: 'Open claims' },
  { value: 'ready_to_archive', label: 'Ready to archive' },
  { value: 'archived', label: 'Archived' },
]

const STAGES: WarrantyStage[] = ['monitoring', 'completed', 'ready_to_archive', 'archived']

type Row = {
  id: string
  project_id: string
  stage: WarrantyStage
  start_date: string
  projects: { name: string; project_number: string | null } | null
  current: { coverage_name: string; stage_label: string; due_on: string; reached_at: string | null } | null
}

export default async function WarrantyPage({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  const session = await requireStaff()
  await requireFeature(session.organizationId, 'warranty')
  const { stage } = await searchParams
  const filter = FILTERS.some((f) => f.value === stage) ? (stage as WarrantyStage | 'all') : 'all'

  const supabase = await createClient()
  let query = supabase
    .from('project_warranties')
    .select(
      'id, project_id, stage, start_date, projects(name, project_number), current:warranty_milestones!project_warranties_current_milestone_fk(coverage_name, stage_label, due_on, reached_at)',
    )
    .order('start_date', { ascending: false })
    .limit(200)
  query = filter === 'all' ? query.neq('stage', 'archived') : query.eq('stage', filter)
  const { data: today } = await supabase.rpc('org_today', { p_org: session.organizationId })
  const todayIso = (today as string | null) ?? new Date().toISOString().slice(0, 10)
  const expiringCutoff = addDaysIso(todayIso, EXPIRING_WINDOW_DAYS)
  const overdueCutoff = addDaysIso(todayIso, -SERVICE_RESPONSE_DAYS)

  const stageCount = (s: WarrantyStage) =>
    supabase.from('project_warranties').select('id', { count: 'exact', head: true }).eq('stage', s)
  const [{ data }, { data: tasks }, claimResult, { data: activeWarranties }, expiringResult, ...stageResults] = await Promise.all([
    query,
    supabase
      .from('warranty_followup_tasks')
      .select('id, project_id, status, projects(name)')
      .neq('status', 'sent')
      .order('created_at')
      .limit(20),
    supabase.from('warranty_claims').select('project_id, status, updated_at').neq('status', 'closed').limit(1000),
    supabase
      .from('project_warranties')
      .select('project_id, projects(name, project_number)')
      .neq('stage', 'archived')
      .limit(500),
    supabase
      .from('warranty_milestones')
      .select('id', { count: 'exact', head: true })
      .is('reached_at', null)
      .gte('due_on', todayIso)
      .lte('due_on', expiringCutoff),
    ...STAGES.map(stageCount),
  ])
  const stageCounts = new Map<WarrantyStage, number | undefined>(
    STAGES.map((s, i) => [s, stageResults[i].error ? undefined : stageResults[i].count ?? 0]),
  )
  const activeStages = STAGES.filter((s) => s !== 'archived')
  const allActiveCount = activeStages.every((s) => stageCounts.get(s) !== undefined)
    ? activeStages.reduce((sum, s) => sum + (stageCounts.get(s) ?? 0), 0)
    : undefined
  const rows = (data ?? []) as unknown as Row[]
  const claimRows = (claimResult.data ?? []) as { project_id: string; status: ClaimStatus; updated_at: string }[]
  const openClaims = new Map<string, number>()
  for (const c of claimRows) {
    openClaims.set(c.project_id, (openClaims.get(c.project_id) ?? 0) + 1)
  }
  const overdueCount = claimRows.filter(
    (c) => BUILDER_OWNED_STATUSES.includes(c.status) && c.updated_at.slice(0, 10) < overdueCutoff,
  ).length
  const activeProjects = ((activeWarranties ?? []) as unknown as {
    project_id: string
    projects: { name: string; project_number: string | null } | null
  }[])
    .map((w) => ({ id: w.project_id, name: w.projects?.name ?? 'Project', number: w.projects?.project_number ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const claimsCount = claimResult.error ? null : claimRows.length
  const expiringCount = expiringResult.error ? null : expiringResult.count ?? 0
  const overdueValue = claimResult.error ? null : overdueCount
  const shown = (v: number | null) => (v === null ? '—' : String(v))
  const stats: SummaryStat[] = [
    {
      key: 'homes',
      icon: Home,
      tone: activeProjects.length > 0 ? 'blue' : 'neutral',
      label: 'Homes under warranty',
      value: String(activeProjects.length),
      note: 'Active coverage',
      href: filter === 'all' ? undefined : '/warranty',
      hrefLabel: 'Show all active warranties',
    },
    {
      key: 'claims',
      icon: ClipboardList,
      tone: claimsCount ? 'amber' : 'neutral',
      label: 'Open claims',
      value: shown(claimsCount),
      note: claimsCount === null ? 'Data unavailable' : 'Not yet closed',
      href: filter === 'completed' ? undefined : '/warranty?stage=completed',
      hrefLabel: 'Show warranties with open claims',
    },
    {
      key: 'expiring',
      icon: Hourglass,
      tone: expiringCount ? 'amber' : 'neutral',
      label: 'Coverage expiring soon',
      value: shown(expiringCount),
      note: expiringCount === null ? 'Data unavailable' : `Next ${EXPIRING_WINDOW_DAYS} days`,
      href: filter === 'monitoring' ? undefined : '/warranty?stage=monitoring',
      hrefLabel: 'Show monitored warranties',
    },
    {
      key: 'overdue',
      icon: AlertTriangle,
      tone: overdueValue ? 'danger' : 'neutral',
      label: 'Overdue responses',
      value: shown(overdueValue),
      note: overdueValue === null ? 'Data unavailable' : `Over ${SERVICE_RESPONSE_DAYS} days`,
      href: filter === 'completed' ? undefined : '/warranty?stage=completed',
      hrefLabel: 'Show warranties with open claims',
    },
  ]
  const filters: WorksheetFilter[] = FILTERS.map((f) => ({
    key: f.value,
    label: f.label,
    href: f.value === 'all' ? '/warranty' : `/warranty?stage=${f.value}`,
    active: filter === f.value,
    count: f.value === 'all' ? allActiveCount : stageCounts.get(f.value),
  }))
  const openTasks = (tasks ?? []) as unknown as { id: string; project_id: string; status: string; projects: { name: string } | null }[]

  return (
    <div className={pageLayout('workspace')}>
      <PageHeader icon={ShieldCheckIcon}
        title="Warranty"
        titleAddon={
          <HeaderHelp label="How warranty coverage works">
            Warranties start automatically on the official completion date. Coverage periods run concurrently: Year 1
            workmanship, Year 2 systems, Year 10 structural.
          </HeaderHelp>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <WarrantyExportMenu />
            {session.role === 'org_admin' && <RunWarrantyButton />}
            <NewClaimMenu projects={activeProjects} />
          </div>
        }
      />

      <SummaryStrip
        id="warranty-summary-heading"
        scope="All active warranties"
        helpLabel="About the warranty summary"
        help={`These figures cover every warranty that is not archived and are not affected by the stage filter. Coverage expiring soon counts periods ending in the next ${EXPIRING_WINDOW_DAYS} days. Overdue responses are open claims waiting on builder action for more than ${SERVICE_RESPONSE_DAYS} days.`}
        stats={stats}
      />

      {openTasks.length > 0 && (
        <section aria-labelledby="followups" className="surface flex flex-col gap-3 p-5">
          <h2 id="followups" className="font-serif text-lg font-semibold">
            Anniversary cards to send
          </h2>
          <ul className="flex flex-col divide-y">
            {openTasks.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                <Link href={`/projects/${t.project_id}/warranty`} className="font-medium hover:text-primary">
                  {t.projects?.name ?? 'Project'}
                </Link>
                <span className="text-muted-foreground">{t.status === 'prepared' ? 'Prepared' : 'To do'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-col">
      <WorksheetFilters label="Filter warranties by stage" noun={{ one: 'warranty', many: 'warranties' }} filters={filters} />

      {rows.length === 0 ? (
        <div className={worksheetResultsClass(true, 'p-4')}>
        <EmptyState
          icon={ShieldCheck}
          title={filter === 'all' ? 'No warranties yet' : 'No warranties in this stage'}
          description={
            filter === 'all'
              ? 'Coverage starts automatically after an authorized builder marks a project Completed. Its warranty will appear here with every coverage period scheduled.'
              : 'No warranties are currently in this stage. Choose another filter to see the rest.'
          }
          action={
            filter === 'all' ? (
              <Link
                href="/projects"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3.5 text-sm font-medium text-link transition-colors hover:bg-sage hover:text-link-hover"
              >
                Go to Projects
              </Link>
            ) : undefined
          }
        />
        </div>
      ) : (
        <div className={worksheetResultsClass(true)}>
        <ul className="flex flex-col divide-y divide-[#D6DDE5]/80 md:hidden" aria-label="Warranties">
          {rows.map((r) => {
            const claims = openClaims.get(r.project_id) ?? 0
            return (
              <li key={r.id} className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
                    <span className="truncate font-semibold text-foreground">{r.projects?.name ?? 'Project'}</span>
                    {r.projects?.project_number && (
                      <>
                        <span aria-hidden="true" className="shrink-0 text-muted-foreground">·</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{r.projects.project_number}</span>
                      </>
                    )}
                  </div>
                  <SemanticBadge tone={STAGE_TONE[r.stage]} className="shrink-0">
                    {r.current?.stage_label ?? WARRANTY_STAGE_LABELS[r.stage]}
                  </SemanticBadge>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs text-muted-foreground">Started</dt>
                    <dd className="tabular-nums">{formatDate(r.start_date)}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs text-muted-foreground">Open claims</dt>
                    <dd className={cn('tabular-nums', claims > 0 && 'font-medium text-[#96570E]')}>{claims}</dd>
                  </div>
                  <div className="col-span-2 flex flex-col gap-0.5">
                    <dt className="text-xs text-muted-foreground">Next coverage end</dt>
                    <dd>
                      <NextMilestone milestone={r.current} />
                    </dd>
                  </div>
                </dl>
                <Link
                  href={`/projects/${r.project_id}/warranty`}
                  className={buttonVariants({ variant: 'action', className: 'h-11 w-full' })}
                >
                  View details
                  <span className="sr-only">{` for ${r.projects?.name ?? 'project'}`}</span>
                </Link>
              </li>
            )
          })}
        </ul>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#D6DDE5] bg-table-head text-left text-xs font-medium text-[#526173]">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Project</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Stage</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Started</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Open claims</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Next coverage end</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D6DDE5]/80">
              {rows.map((r) => {
                const claims = openClaims.get(r.project_id) ?? 0
                return (
                  <tr key={r.id} className="transition-colors hover:bg-link-soft/60">
                    <td className="max-w-xs px-4 py-2.5">
                      <div className="flex min-w-0 items-baseline gap-2 whitespace-nowrap">
                        <Link
                          href={`/projects/${r.project_id}/warranty`}
                          className="truncate font-semibold text-link hover:text-link-hover"
                        >
                          {r.projects?.name ?? 'Project'}
                        </Link>
                        {r.projects?.project_number && (
                          <>
                            <span aria-hidden="true" className="shrink-0 text-muted-foreground">
                              ·
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">{r.projects.project_number}</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <SemanticBadge tone={STAGE_TONE[r.stage]}>
                        {r.current?.stage_label ?? WARRANTY_STAGE_LABELS[r.stage]}
                      </SemanticBadge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted-foreground">{formatDate(r.start_date)}</td>
                    <td className={cn('px-4 py-2.5 text-right tabular-nums', claims > 0 ? 'font-medium text-[#96570E]' : 'text-muted-foreground')}>
                      {claims}
                    </td>
                    <td className="max-w-xs px-4 py-2.5">
                      <NextMilestone milestone={r.current} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        </div>
      )}
      </div>
    </div>
  )
}
