import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ShieldCheck as ShieldCheckIcon } from 'lucide-react'
import { canManage, requireStaff } from '@/lib/session'
import { SubmitClaimForm, type StaffOption } from '@/components/warranty/claim-forms'
import { ClaimList } from '@/components/warranty/claim-list'
import { requireFeature } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'
import { PageHeader } from '@/components/shared/page-header'
import { ArchiveWarrantyButton } from '@/components/warranty/run-warranty-button'
import { CorrectCompletionForm, EnrollWarrantyForm, FollowupForm } from '@/components/warranty/warranty-forms'
import { WARRANTY_STAGE_LABELS, daysUntil, type WarrantyStage } from '@/components/warranty/stage'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Project warranty' }

type Milestone = {
  id: string
  coverage_name: string
  stage_label: string
  categories: string[]
  due_on: string
  reached_at: string | null
}

type Coverage = { coverage_key: string; name: string; description: string | null; exclusions: string | null }

export default async function ProjectWarrantyPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff()
  await requireFeature(session.organizationId, 'warranty')
  const { id } = await params
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

  const stage = warranty?.stage as WarrantyStage | undefined
  const snapshot = warranty?.terms_snapshot as { template_name?: string; disclaimer?: string; coverages?: Coverage[] } | undefined

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={ShieldCheckIcon}
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
          <section aria-labelledby="status" className="surface flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex flex-col gap-1">
              <h2 id="status" className="text-sm text-muted-foreground">
                Status
              </h2>
              <p className="font-serif text-xl font-semibold">{stage ? WARRANTY_STAGE_LABELS[stage] : '-'}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              {openIssues ?? 0} open issue{openIssues === 1 ? '' : 's'} on this project
            </p>
          </section>

          <section aria-labelledby="milestones" className="flex flex-col gap-3">
            <h2 id="milestones" className="font-serif text-lg font-semibold">
              Coverage periods
            </h2>
            <ul className="grid gap-4 md:grid-cols-3">
              {((milestones ?? []) as Milestone[]).map((m) => {
                const days = daysUntil(m.due_on)
                const current = m.id === warranty.current_milestone_id
                return (
                  <li key={m.id} className={cn('surface flex flex-col gap-3 p-5', current && 'ring-2 ring-primary')}>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-medium">{m.coverage_name}</h3>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs',
                          m.reached_at ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary',
                        )}
                      >
                        {m.reached_at ? 'Ended' : current ? 'Current' : 'Active'}
                      </span>
                    </div>
                    <p className="text-sm">
                      Ends {formatDate(m.due_on)}
                      {!m.reached_at && (
                        <span className="text-muted-foreground">
                          {' '}
                          · {days > 0 ? `${days} day${days === 1 ? '' : 's'} left` : 'due today'}
                        </span>
                      )}
                    </p>
                    {m.categories.length > 0 && (
                      <ul className="flex flex-wrap gap-1.5">
                        {m.categories.map((c) => (
                          <li key={c} className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {c}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
            {snapshot?.disclaimer && <p className="text-xs text-muted-foreground">{snapshot.disclaimer}</p>}
          </section>

          {(tasks ?? []).length > 0 && (
            <section aria-labelledby="followups" className="surface flex flex-col gap-4 p-5">
              <h2 id="followups" className="font-serif text-lg font-semibold">
                Anniversary card
              </h2>
              {(tasks ?? []).map((t) =>
                t.status === 'sent' ? (
                  <p key={t.id} className="text-sm text-muted-foreground">
                    Sent {t.sent_on ? formatDate(t.sent_on) : ''} by {String(t.delivery_method).replace('_', ' ')}.
                  </p>
                ) : (
                  <FollowupForm key={t.id} taskId={t.id} projectId={id} status={t.status} today={todayIso} />
                ),
              )}
            </section>
          )}

          {isAdmin && stage !== 'archived' && (
            <section aria-labelledby="correct" className="surface flex flex-col gap-4 p-5">
              <div className="flex flex-col gap-1">
                <h2 id="correct" className="font-serif text-lg font-semibold">
                  Correct completion date
                </h2>
                <p className="text-sm text-muted-foreground">
                  Official date: {project.completion_date ? formatDate(project.completion_date) : 'not recorded'}.
                  Corrections move every unreached milestone and are recorded with your reason.
                </p>
              </div>
              <CorrectCompletionForm projectId={id} today={todayIso} />
            </section>
          )}

          <section aria-labelledby="claims" className="flex flex-col gap-3">
            <h2 id="claims" className="font-serif text-lg font-semibold">
              Warranty claims
            </h2>
            {warranty.stage !== 'archived' && (
              <details className="surface p-5">
                <summary className="cursor-pointer text-sm font-medium">Log a claim on the homeowner&apos;s behalf</summary>
                <div className="mt-4">
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
              coverageNames={Object.fromEntries((milestones ?? []).map((m) => [m.coverage_key, m.coverage_name]))}
            />
          </section>

          <section aria-labelledby="history" className="flex flex-col gap-3">
            <h2 id="history" className="font-serif text-lg font-semibold">
              History
            </h2>
            <ol className="surface flex flex-col divide-y">
              {(events ?? []).map((e) => (
                <li key={e.id} className="flex flex-wrap justify-between gap-2 px-5 py-3 text-sm">
                  <span>{e.summary}</span>
                  <time dateTime={e.created_at} className="text-muted-foreground">
                    {formatDate(e.created_at)}
                  </time>
                </li>
              ))}
              {(corrections ?? []).length === 0 && (events ?? []).length === 0 && (
                <li className="px-5 py-3 text-sm text-muted-foreground">No history yet.</li>
              )}
            </ol>
          </section>
        </>
      )}
    </div>
  )
}
