import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  CalendarCog,
  CalendarRange,
  ChevronDown,
  ClipboardList,
  History as HistoryIcon,
  Mail,
  Plus,
  ShieldCheck as ShieldCheckIcon,
} from 'lucide-react'
import { canManage, requireStaff } from '@/lib/session'
import { SubmitClaimForm, type StaffOption } from '@/components/warranty/claim-forms'
import { ClaimList } from '@/components/warranty/claim-list'
import { requireFeature } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'
import { PageHeader } from '@/components/shared/page-header'
import { CardSectionHeader } from '@/components/shared/card-section-header'
import { ArchiveWarrantyButton } from '@/components/warranty/run-warranty-button'
import { CorrectCompletionForm, EnrollWarrantyForm, FollowupForm } from '@/components/warranty/warranty-forms'
import { WARRANTY_STAGE_LABELS, type WarrantyStage } from '@/components/warranty/stage'
import { CoverageTimeline, type TimelineMilestone } from '@/components/warranty/coverage-timeline'

export const metadata: Metadata = { title: 'Project warranty' }

type Coverage = { coverage_key: string; name: string; description: string | null; exclusions: string | null }
type HistoryEntry = { id: string; summary: string; created_at: string }

const HISTORY_PREVIEW = 6
const CARD_HEADER = 'px-5 pt-5 md:px-6'

export default async function ProjectWarrantyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ claim?: string }>
}) {
  const session = await requireStaff()
  await requireFeature(session.organizationId, 'warranty')
  const { id } = await params
  const openClaimForm = (await searchParams).claim === 'new'
  const supabase = await createClient()
  const isAdmin = session.role === 'org_admin'

  const [{ data: project }, { data: warranty }, { data: today }] = await Promise.all([
    supabase.from('projects').select('id, name, status, completion_date').eq('id', id).maybeSingle(),
    supabase
      .from('project_warranties')
      .select('id, stage, start_date, enrollment_method, terms_snapshot, current_milestone_id, archived_at')
      .eq('project_id', id)
      .maybeSingle(),
    supabase.rpc('org_today', { p_org: session.organizationId }),
  ])
  if (!project) notFound()
  const todayIso = (today as string | null) ?? new Date().toISOString().slice(0, 10)

  const { data: staffMembers } = await supabase
    .from('organization_memberships')
    .select('user_id')
    .eq('organization_id', session.organizationId)
    .eq('status', 'active')
    .neq('role', 'client')
  const staffIds = (staffMembers ?? []).map((m) => m.user_id as string)
  const { data: staffProfiles } = staffIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', staffIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null }[] }
  const staffOptions: StaffOption[] = (staffProfiles ?? []).map((p) => ({ id: p.id, name: p.full_name || p.email || 'Team member' }))

  const [{ data: milestones }, { data: tasks }, { data: events }, { data: corrections }, { count: openIssues }] =
    warranty
      ? await Promise.all([
          supabase
            .from('warranty_milestones')
            .select('id, coverage_key, coverage_name, stage_label, categories, due_on, reached_at')
            .eq('warranty_id', warranty.id)
            .order('sort_order'),
          supabase
            .from('warranty_followup_tasks')
            .select('id, status, sent_on, delivery_method')
            .eq('warranty_id', warranty.id)
            .order('created_at'),
          supabase
            .from('warranty_events')
            .select('id, summary, created_at')
            .eq('warranty_id', warranty.id)
            .order('created_at', { ascending: false })
            .limit(50),
          supabase
            .from('project_completion_corrections')
            .select('id, previous_date, new_date, reason, created_at')
            .eq('project_id', id)
            .order('created_at', { ascending: false }),
          supabase
            .from('project_issues')
            .select('id', { count: 'exact', head: true })
            .eq('project_id', id)
            .not('status', 'in', '(resolved,closed)'),
        ])
      : [{ data: null }, { data: null }, { data: null }, { data: null }, { count: 0 }]

  const { data: openClaimRows } = warranty
    ? await supabase.from('warranty_claims').select('coverage_key').eq('project_id', id).neq('status', 'closed')
    : { data: [] as { coverage_key: string }[] }
  const openClaimsByCoverage: Record<string, number> = {}
  for (const c of openClaimRows ?? []) openClaimsByCoverage[c.coverage_key] = (openClaimsByCoverage[c.coverage_key] ?? 0) + 1
  const openClaimCount = (openClaimRows ?? []).length

  const stage = warranty?.stage as WarrantyStage | undefined
  const snapshot = warranty?.terms_snapshot as { template_name?: string; disclaimer?: string; coverages?: Coverage[] } | undefined
  const history = (events ?? []) as HistoryEntry[]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        tone="section"
        icon={ShieldCheckIcon}
        title="Warranty"
        description={
          warranty
            ? `${snapshot?.template_name ?? 'Warranty'} · started ${formatDate(warranty.start_date)}${
                warranty.enrollment_method === 'backfill' ? ' (enrolled after completion)' : ''
              }`
            : 'Warranties start automatically when a project is marked Completed.'
        }
        actions={
          warranty && isAdmin && (stage === 'ready_to_archive' || stage === 'archived') ? (
            <ArchiveWarrantyButton warrantyId={warranty.id} projectId={id} reopen={stage === 'archived'} />
          ) : null
        }
      />

      {!warranty && (
        <section className="surface flex flex-col gap-4 p-5">
          {project.status !== 'completed' ? (
            <p className="text-sm text-muted-foreground">
              This project is not Completed yet. Its warranty will begin on the official completion date.
            </p>
          ) : isAdmin ? (
            <>
              <p className="text-sm text-muted-foreground">
                This project was completed before Warranty Management was turned on. Enroll it to start tracking.
              </p>
              <EnrollWarrantyForm projectId={id} needsDate={!project.completion_date} today={todayIso} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Ask an administrator to enroll this project in warranty tracking.</p>
          )}
        </section>
      )}

      {warranty && (
        <>
          <section aria-labelledby="status" className="surface flex flex-wrap items-center justify-between gap-4 px-5 py-4 md:px-6">
            <div className="flex flex-col gap-0.5">
              <h2 id="status" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Warranty stage
              </h2>
              <p className="font-serif text-xl font-semibold text-foreground">{stage ? WARRANTY_STAGE_LABELS[stage] : '-'}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              {openIssues ?? 0} open issue{openIssues === 1 ? '' : 's'} on this project
            </p>
          </section>

          <section aria-labelledby="milestones" className="surface flex flex-col overflow-hidden">
            <CardSectionHeader
              id="milestones"
              title="Coverage periods"
              subtitle="Bars show the share of each period that has elapsed."
              icon={CalendarRange}
              className={CARD_HEADER}
            />
            <CoverageTimeline
              startDate={warranty.start_date}
              milestones={(milestones ?? []) as TimelineMilestone[]}
              todayIso={todayIso}
              openClaimsByCoverage={openClaimsByCoverage}
            />
            {snapshot?.disclaimer && (
              <p className="border-t border-border/60 px-5 py-3 text-xs leading-relaxed text-muted-foreground md:px-6">
                {snapshot.disclaimer}
              </p>
            )}
          </section>

          {(tasks ?? []).length > 0 && (
            <section aria-labelledby="followups" className="surface flex flex-col gap-4 pb-5">
              <CardSectionHeader id="followups" title="Anniversary card" icon={Mail} className={CARD_HEADER} />
              <div className="flex flex-col gap-4 px-5 md:px-6">
                {(tasks ?? []).map((t) =>
                  t.status === 'sent' ? (
                    <p key={t.id} className="text-sm text-muted-foreground">
                      Sent {t.sent_on ? formatDate(t.sent_on) : ''} by {String(t.delivery_method).replace('_', ' ')}.
                    </p>
                  ) : (
                    <FollowupForm key={t.id} taskId={t.id} projectId={id} status={t.status} today={todayIso} />
                  ),
                )}
              </div>
            </section>
          )}

          <section
            id="claims-section"
            aria-labelledby="claims"
            className="surface flex scroll-mt-36 flex-col overflow-hidden"
          >
            <CardSectionHeader
              id="claims"
              title="Warranty claims"
              subtitle={`${openClaimCount} open claim${openClaimCount === 1 ? '' : 's'}`}
              icon={ClipboardList}
              className={CARD_HEADER}
            />
            {warranty.stage !== 'archived' && (
              <details className="group border-b border-border/60" open={openClaimForm}>
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-5 py-3 text-sm font-medium text-primary outline-none hover:bg-sage/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:px-6 [&::-webkit-details-marker]:hidden">
                  <Plus className="size-4 transition-transform group-open:rotate-45" aria-hidden="true" />
                  Log a claim on the homeowner&apos;s behalf
                </summary>
                <div className="px-5 pb-5 md:px-6">
                  <SubmitClaimForm
                    projectId={id}
                    coverages={(milestones ?? []).map((m) => ({
                      coverage_key: m.coverage_key,
                      name: m.coverage_name,
                      categories: m.categories,
                      ended: Boolean(m.reached_at) || m.due_on < todayIso,
                    }))}
                  />
                </div>
              </details>
            )}
            <ClaimList
              projectId={id}
              audience="staff"
              isManager={canManage(session.role)}
              staff={staffOptions}
              embedded
              coverageNames={Object.fromEntries((milestones ?? []).map((m) => [m.coverage_key, m.coverage_name]))}
            />
          </section>

          <section aria-labelledby="history" className="surface flex flex-col gap-4 pb-5">
            <CardSectionHeader
              id="history"
              title="History"
              subtitle={history.length ? `${history.length} event${history.length === 1 ? '' : 's'}` : undefined}
              icon={HistoryIcon}
              className={CARD_HEADER}
            />
            <div className="px-5 md:px-6">
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No history yet.</p>
              ) : (
                <>
                  <HistoryTimeline entries={history.slice(0, HISTORY_PREVIEW)} />
                  {history.length > HISTORY_PREVIEW && (
                    <details className="group">
                      <summary className="mt-1 inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-md text-sm font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
                        <span className="group-open:hidden">Show all {history.length} events</span>
                        <span className="hidden group-open:inline">Show fewer</span>
                      </summary>
                      <HistoryTimeline entries={history.slice(HISTORY_PREVIEW)} />
                    </details>
                  )}
                </>
              )}
            </div>
          </section>

          {isAdmin && stage !== 'archived' && (
            <details className="surface group overflow-hidden">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 outline-none hover:bg-sage/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:px-6 [&::-webkit-details-marker]:hidden">
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sage text-primary ring-1 ring-inset ring-primary/10"
                  >
                    <CalendarCog className="size-5" />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="font-serif text-lg font-semibold leading-tight text-foreground">Warranty administration</span>
                    <span className="text-sm text-muted-foreground">
                      Official completion date: {project.completion_date ? formatDate(project.completion_date) : 'not recorded'}
                    </span>
                  </span>
                </span>
                <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="flex flex-col gap-5 border-t border-border/60 px-5 py-5 md:px-6">
                <div className="flex flex-col gap-1">
                  <h2 className="text-sm font-semibold text-foreground">Correct completion date</h2>
                  <p className="text-sm text-muted-foreground">
                    Corrections move every unreached milestone and are recorded with your reason.
                  </p>
                </div>
                <CorrectCompletionForm projectId={id} today={todayIso} />
                {(corrections ?? []).length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-semibold text-foreground">Correction log</h3>
                    <ul className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/60">
                      {(corrections ?? []).map((c) => (
                        <li key={c.id} className="flex flex-col gap-0.5 px-4 py-3 text-sm">
                          <span className="tabular-nums text-foreground">
                            {c.previous_date ? formatDate(c.previous_date) : 'Not recorded'} → {formatDate(c.new_date)}
                          </span>
                          <span className="text-muted-foreground">{c.reason}</span>
                          <time dateTime={c.created_at} className="text-xs text-muted-foreground">
                            Recorded {formatDate(c.created_at)}
                          </time>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  )
}

function HistoryTimeline({ entries }: { entries: HistoryEntry[] }) {
  return (
    <ol className="flex flex-col">
      {entries.map((e) => (
        <li key={e.id} className="relative flex gap-3 pb-4 last:pb-1">
          <span aria-hidden="true" className="relative flex w-3 shrink-0 justify-center">
            <span className="mt-1.5 size-2 rounded-full bg-primary/50 ring-4 ring-card" />
            <span className="absolute bottom-[-0.25rem] top-4 w-px bg-border" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
            <span className="text-pretty text-sm text-foreground">{e.summary}</span>
            <time dateTime={e.created_at} className="shrink-0 text-xs tabular-nums text-muted-foreground sm:text-sm">
              {formatDate(e.created_at)}
            </time>
          </div>
        </li>
      ))}
    </ol>
  )
}
