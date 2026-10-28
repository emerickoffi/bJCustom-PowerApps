import type { Metadata } from 'next'
import Link from 'next/link'
import { ShieldCheck, ShieldCheck as ShieldCheckIcon } from 'lucide-react'
import { requireStaff } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'
import { PageHeader, EmptyState } from '@/components/shared/page-header'
import { RunWarrantyButton } from '@/components/warranty/run-warranty-button'
import { WARRANTY_STAGE_LABELS, type WarrantyStage } from '@/components/warranty/stage'
import { NextMilestone } from '@/components/warranty/next-milestone'
import { cn } from '@/lib/utils'
import { SemanticBadge, type SemanticTone } from '@/components/shared/semantic-badge'

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
  const [{ data }, { data: tasks }, { data: claimRows }] = await Promise.all([
    query,
    supabase
      .from('warranty_followup_tasks')
      .select('id, project_id, status, projects(name)')
      .neq('status', 'sent')
      .order('created_at')
      .limit(20),
    supabase.from('warranty_claims').select('project_id').neq('status', 'closed').limit(1000),
  ])
  const rows = (data ?? []) as unknown as Row[]
  const openClaims = new Map<string, number>()
  for (const c of (claimRows ?? []) as { project_id: string }[]) {
    openClaims.set(c.project_id, (openClaims.get(c.project_id) ?? 0) + 1)
  }
  const openTasks = (tasks ?? []) as unknown as { id: string; project_id: string; status: string; projects: { name: string } | null }[]

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={ShieldCheckIcon}
        title="Warranty"
        description="Warranties start automatically on the official completion date. Coverage periods run concurrently: Year 1 workmanship, Year 2 systems, Year 10 structural."
        actions={session.role === 'org_admin' ? <RunWarrantyButton /> : null}
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

      <nav aria-label="Filter warranties" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value === 'all' ? '/warranty' : `/warranty?stage=${f.value}`}
            aria-current={filter === f.value ? 'page' : undefined}
            className={cn(
              'flex min-h-11 items-center rounded-full border px-3.5 text-sm font-medium transition-colors md:min-h-0 md:py-1.5',
              filter === f.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-[#E2E8E2] bg-card text-foreground hover:bg-[#EAF0E9] hover:text-primary',
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
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
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-sage hover:text-primary"
              >
                Go to Projects
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
        <ul className="flex flex-col gap-3 md:hidden" aria-label="Warranties">
          {rows.map((r) => {
            const claims = openClaims.get(r.project_id) ?? 0
            return (
              <li key={r.id} className="surface flex flex-col gap-3 p-4">
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
                    <dt className="text-xs text-muted-foreground">Next milestone</dt>
                    <dd>
                      <NextMilestone milestone={r.current} />
                    </dd>
                  </div>
                </dl>
                <Link
                  href={`/projects/${r.project_id}/warranty`}
                  className="flex h-11 items-center justify-center rounded-lg border bg-card text-sm font-medium transition-colors hover:bg-sage hover:text-primary"
                >
                  View details
                  <span className="sr-only">{` for ${r.projects?.name ?? 'project'}`}</span>
                </Link>
              </li>
            )
          })}
        </ul>
        <div className="surface hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#E2E8E2] bg-[#F4F6F3] text-left text-xs font-medium uppercase tracking-wide text-[#64756D]">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">Project</th>
                <th scope="col" className="px-5 py-3 font-medium">Stage</th>
                <th scope="col" className="px-5 py-3 font-medium">Started</th>
                <th scope="col" className="px-5 py-3 font-medium">Next milestone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8E2]/80">
              {rows.map((r) => {
                    return (
                  <tr key={r.id} className="transition-colors hover:bg-[#F8F7F3]">
                    <td className="max-w-xs px-5 py-3.5">
                      <div className="flex min-w-0 items-baseline gap-2 whitespace-nowrap">
                        <Link
                          href={`/projects/${r.project_id}/warranty`}
                          className="truncate font-semibold text-foreground hover:text-primary"
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
                    <td className="px-5 py-3.5">
                      <SemanticBadge tone={STAGE_TONE[r.stage]}>
                        {r.current?.stage_label ?? WARRANTY_STAGE_LABELS[r.stage]}
                      </SemanticBadge>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 tabular-nums text-muted-foreground">{formatDate(r.start_date)}</td>
                    <td className="px-5 py-3.5">
                      <NextMilestone milestone={r.current} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  )
}
