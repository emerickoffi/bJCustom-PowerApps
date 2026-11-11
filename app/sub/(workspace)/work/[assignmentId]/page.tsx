import { notFound } from 'next/navigation'
import { Hammer } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { requireSubcontractor } from '@/lib/subcontractor-session'
import { createClient } from '@/lib/supabase/server'
import { formatDate, APP_TIME_ZONE } from '@/lib/format'
import { todayIn } from '@/lib/subcontractor-qualification'
import { isUuid } from '@/lib/subcontractor-projects'
import { workStateFor } from '@/lib/subcontractor-work'
import { loadSubmissionCycles } from '@/lib/subcontractor-work-data'
import { WorkStateBadge } from '@/components/subcontractor-work/work-state-badge'
import { SubmissionComposer } from '@/components/subcontractor-work/submission-composer'
import { SubmissionHistory } from '@/components/subcontractor-work/submission-history'
import { AwaitingBuilderNotice } from '@/components/subcontractor-work/awaiting-builder-notice'

type WorkRow = {
  assignment_id: string
  project_name: string
  project_city: string | null
  activity_name: string
  activity_phase: string | null
  planned_start: string | null
  planned_end: string | null
  scope_of_work: string | null
}

export default async function SubWorkPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const session = await requireSubcontractor()
  const { assignmentId } = await params
  if (!isUuid(assignmentId)) notFound()
  const supabase = await createClient()
  const { data } = await supabase.rpc('sub_assigned_work')
  const work = ((data ?? []) as WorkRow[]).find((w) => w.assignment_id === assignmentId)
  if (!work) notFound()

  const { cycles } = await loadSubmissionCycles({ column: 'assignment_id', value: assignmentId })
  const latest = cycles[0]
  const lastDecided = cycles.find((c) => c.status !== 'draft')
  const state = workStateFor(lastDecided?.status)
  const canSubmit = !lastDecided || ['correction_required', 'returned'].includes(lastDecided.status)
  const draft = latest?.status === 'draft' ? latest : null
  const names = new Map(cycles.flatMap((c) => (c.submittedBy === session.userId ? [[c.submittedBy, 'You'] as const] : [])))

  return (
    <>
      <PageHeader
        icon={Hammer}
        title={work.activity_name}
        eyebrow={work.project_name}
        titleAddon={<WorkStateBadge state={state} />}
        backHref="/sub"
        backLabel="All work"
      />
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Planned start</dt>
            <dd className="text-foreground">{work.planned_start ? formatDate(work.planned_start) : 'Not set'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Planned finish</dt>
            <dd className="text-foreground">{work.planned_end ? formatDate(work.planned_end) : 'Not set'}</dd>
          </div>
        </dl>
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium text-foreground">Scope and instructions</h2>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{work.scope_of_work || 'No written scope. Contact the builder with questions.'}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Submitting reports completion only. The builder verifies the work; the schedule and payments are not changed automatically.
        </p>
      </section>

      {state === 'submitted' && <AwaitingBuilderNotice />}

      {lastDecided?.reviewNotes && lastDecided.status !== 'accepted' && (
        <section aria-labelledby="feedback-heading" className="flex flex-col gap-1 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <h2 id="feedback-heading" className="text-sm font-semibold text-destructive">
            Builder Feedback
          </h2>
          <p className="whitespace-pre-wrap text-sm text-foreground">{lastDecided.reviewNotes}</p>
        </section>
      )}

      {canSubmit && (
        <section aria-labelledby="submit-heading" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
          <h2 id="submit-heading" className="type-section-title text-foreground">
            {lastDecided ? 'Resubmit completed work' : 'Report completed work'}
          </h2>
          <SubmissionComposer
            kind="work"
            targetId={assignmentId}
            today={todayIn(APP_TIME_ZONE)}
            isResubmission={Boolean(lastDecided)}
            draft={draft ? { id: draft.id, organizationId: draft.organizationId, items: draft.completion } : null}
          />
        </section>
      )}

      <section aria-labelledby="history-heading" className="flex flex-col gap-3">
        <h2 id="history-heading" className="type-section-title text-foreground">
          Submission history
        </h2>
        <SubmissionHistory cycles={cycles} names={names} audience="sub" />
      </section>
    </>
  )
}
