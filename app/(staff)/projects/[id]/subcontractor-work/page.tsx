import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, ChevronRight, ClipboardCheck } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatDateTime } from '@/lib/format'
import { isSubWorkSetupError, workStateFor, type SubmissionStatus } from '@/lib/subcontractor-work'
import { PageHeader, Surface } from '@/components/shared/page-header'
import { WorkStateBadge } from '@/components/subcontractor-work/work-state-badge'

export const metadata: Metadata = { title: 'Subcontractor work' }

type QueueRow = {
  id: string
  submission_kind: 'work' | 'correction'
  cycle: number
  status: SubmissionStatus
  completed_on: string | null
  submitted_at: string | null
  reviewed_at: string | null
  company: { company_name: string } | null
  assignment: { activity: { name: string } | null } | null
  issue: { item_label: string | null; category: string | null } | null
}

export default async function SubcontractorWorkQueuePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'subcontractors')
  const { id } = await params
  const supabase = await createClient()

  const [{ data: project }, { data: canViewInternal }] = await Promise.all([
    supabase.from('projects').select('id, name').eq('id', id).eq('organization_id', session.organizationId).maybeSingle(),
    supabase.rpc('can_view_project_internal', { p_project: id }),
  ])
  if (!project || !canViewInternal) notFound()

  const { data, error } = await supabase
    .from('subcontractor_work_submissions')
    .select(
      `id, submission_kind, cycle, status, completed_on, submitted_at, reviewed_at,
       company:subcontractor_companies(company_name),
       assignment:schedule_activity_assignments!subcontractor_work_submissions_assignment_id_fkey(activity:schedule_activities(name)),
       issue:project_issues!subcontractor_work_submissions_issue_id_fkey(item_label, category)`,
    )
    .eq('project_id', id)
    .eq('organization_id', session.organizationId)
    .neq('status', 'draft')
    .order('submitted_at', { ascending: false })
    .limit(200)

  const rows = (data ?? []) as unknown as QueueRow[]
  const awaiting = rows.filter((r) => r.status === 'submitted').sort((a, b) => (a.submitted_at ?? '').localeCompare(b.submitted_at ?? ''))
  const reviewed = rows.filter((r) => r.status !== 'submitted')

  return (
    <div className="flex w-full max-w-5xl flex-col gap-5">
      <PageHeader
        icon={ClipboardCheck}
        title="Subcontractor work"
        description="Verify completion and correction submissions before work counts as accepted."
      />

      {error ? (
        <p className="flex items-start gap-2 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          {isSubWorkSetupError(error)
            ? 'Subcontractor work verification is not set up in this environment yet.'
            : 'Submissions could not be loaded. Refresh the page to try again.'}
        </p>
      ) : (
        <>
          <QueueSection
            headingId="awaiting-heading"
            title="Awaiting verification"
            rows={awaiting}
            projectId={id}
            empty="Nothing is waiting on you. New submissions appear here as subcontractors send them."
          />
          <QueueSection
            headingId="reviewed-heading"
            title="Reviewed"
            rows={reviewed}
            projectId={id}
            empty="No reviewed submissions yet."
          />
        </>
      )}
    </div>
  )
}

function QueueSection({
  headingId,
  title,
  rows,
  projectId,
  empty,
}: {
  headingId: string
  title: string
  rows: QueueRow[]
  projectId: string
  empty: string
}) {
  return (
    <Surface aria-labelledby={headingId} className="gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={headingId} className="font-serif text-lg font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        <span className="text-xs text-muted-foreground">
          {rows.length} {rows.length === 1 ? 'submission' : 'submissions'}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/projects/${projectId}/subcontractor-work/${r.id}`}
                className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium text-foreground">{targetLabel(r)}</span>
                  <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>{r.company?.company_name ?? 'Subcontractor'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{r.submission_kind === 'work' ? 'Work completion' : 'Correction'}</span>
                    {r.cycle > 1 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Resubmission {r.cycle}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span>
                      {r.status === 'submitted'
                        ? `Submitted ${r.submitted_at ? formatDateTime(r.submitted_at) : ''}`
                        : `Reviewed ${r.reviewed_at ? formatDate(r.reviewed_at) : ''}`}
                    </span>
                  </span>
                </div>
                <WorkStateBadge state={workStateFor(r.status)} audience="builder" className="shrink-0" />
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Surface>
  )
}

function targetLabel(r: QueueRow) {
  if (r.submission_kind === 'work') return r.assignment?.activity?.name ?? 'Schedule activity'
  return r.issue?.item_label || r.issue?.category || 'Punch list item'
}
