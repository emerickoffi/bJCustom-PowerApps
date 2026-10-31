import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { requireSubcontractor } from '@/lib/subcontractor-session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatDate, APP_TIME_ZONE } from '@/lib/format'
import { todayIn } from '@/lib/subcontractor-qualification'
import { isUuid } from '@/lib/subcontractor-projects'
import { workStateFor } from '@/lib/subcontractor-work'
import { MEDIA_BUCKET, type MediaItem, type MediaKind } from '@/lib/walkthroughs'
import { loadSubmissionCycles } from '@/lib/subcontractor-work-data'
import { MediaGrid } from '@/components/walkthroughs/media-uploader'
import { WorkStateBadge } from '@/components/subcontractor-work/work-state-badge'
import { SubmissionComposer } from '@/components/subcontractor-work/submission-composer'
import { SubmissionHistory } from '@/components/subcontractor-work/submission-history'

type CorrectionRow = {
  issue_id: string
  project_name: string
  category: string | null
  item_label: string | null
  description: string | null
  corrective_action: string | null
  priority: string | null
  due_date: string | null
}
type EvidenceRow = { id: string; storage_path: string; file_name: string; media_kind: MediaKind }

/** sub_issue_evidence authorizes the caller first; only then are the returned paths signed for display. */
async function loadOriginalEvidence(issueId: string): Promise<MediaItem[]> {
  const supabase = await createClient()
  const { data } = await supabase.rpc('sub_issue_evidence', { p_issue: issueId })
  const rows = (data ?? []) as EvidenceRow[]
  if (!rows.length) return []
  const { data: signed } = await createAdminClient()
    .storage.from(MEDIA_BUCKET)
    .createSignedUrls(rows.map((r) => r.storage_path), 60 * 60)
  const urls = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]))
  return rows.map((r) => ({ id: r.id, storage_path: r.storage_path, file_name: r.file_name, media_kind: r.media_kind, url: urls.get(r.storage_path) ?? null }))
}

export default async function SubCorrectionPage({ params }: { params: Promise<{ issueId: string }> }) {
  const session = await requireSubcontractor()
  const { issueId } = await params
  if (!isUuid(issueId)) notFound()
  const supabase = await createClient()
  const { data } = await supabase.rpc('sub_correction_requests')
  const issue = ((data ?? []) as CorrectionRow[]).find((c) => c.issue_id === issueId)
  if (!issue) notFound()

  const [{ cycles }, original] = await Promise.all([loadSubmissionCycles({ column: 'issue_id', value: issueId }), loadOriginalEvidence(issueId)])
  const latest = cycles[0]
  const lastDecided = cycles.find((c) => c.status !== 'draft')
  const state = workStateFor(lastDecided?.status)
  const canSubmit = !lastDecided || ['correction_required', 'returned'].includes(lastDecided.status)
  const draft = latest?.status === 'draft' ? latest : null
  const names = new Map(cycles.flatMap((c) => (c.submittedBy === session.userId ? [[c.submittedBy, 'You'] as const] : [])))

  return (
    <>
      <Link href="/sub" className="flex min-h-11 items-center gap-1 self-start text-sm font-medium text-muted-foreground hover:text-primary">
        <ArrowLeft className="size-4" aria-hidden="true" />
        All work
      </Link>
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {issue.project_name}
              {issue.category ? ` · ${issue.category}` : ''}
            </p>
            <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">{issue.item_label || 'Punch list item'}</h1>
          </div>
          <WorkStateBadge state={state} />
        </div>
        {issue.due_date && <p className="text-sm text-muted-foreground">Due {formatDate(issue.due_date)}</p>}
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium text-foreground">Corrective instructions</h2>
          <p className="whitespace-pre-wrap text-sm text-foreground">{issue.corrective_action || 'See the deficiency below.'}</p>
        </div>
        {issue.description && (
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium text-foreground">Deficiency</h2>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{issue.description}</p>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-foreground">Original evidence</h2>
          <MediaGrid items={original} emptyLabel="No original photos." evidence="original" />
        </div>
      </section>

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
          <h2 id="submit-heading" className="font-serif text-lg font-semibold text-foreground">
            {lastDecided ? 'Resubmit the correction' : 'Report the correction'}
          </h2>
          <SubmissionComposer
            kind="correction"
            targetId={issueId}
            today={todayIn(APP_TIME_ZONE)}
            isResubmission={Boolean(lastDecided)}
            draft={draft ? { id: draft.id, organizationId: draft.organizationId, items: draft.completion } : null}
          />
        </section>
      )}

      <section aria-labelledby="history-heading" className="flex flex-col gap-3">
        <h2 id="history-heading" className="font-serif text-lg font-semibold text-foreground">
          Submission history
        </h2>
        <SubmissionHistory cycles={cycles} names={names} audience="sub" />
      </section>
    </>
  )
}
