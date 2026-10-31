import { MediaGrid } from '@/components/walkthroughs/media-uploader'
import { formatDate, formatDateTime } from '@/lib/format'
import { DECISION_LABELS, workStateFor, type ReviewDecision } from '@/lib/subcontractor-work'
import type { SubmissionCycle } from '@/lib/subcontractor-work-data'
import { WorkStateBadge } from '@/components/subcontractor-work/work-state-badge'

/** Read-only, append-only record of each submission and verification cycle. */
export function SubmissionHistory({
  cycles,
  names,
  audience,
  issueLabels,
}: {
  cycles: SubmissionCycle[]
  names: Map<string, string>
  audience: 'sub' | 'builder'
  issueLabels?: Map<string, string>
}) {
  const visible = cycles.filter((c) => c.status !== 'draft')
  if (!visible.length) return <p className="text-sm text-muted-foreground">No submissions yet.</p>
  const who = (id: string | null, fallback: string) => (id ? (names.get(id) ?? fallback) : fallback)
  return (
    <ol className="flex flex-col gap-4">
      {visible.map((c) => (
        <li key={c.id} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-foreground">
              {c.cycle === 1 ? 'Submission' : `Resubmission ${c.cycle - 1}`}
            </span>
            <WorkStateBadge state={workStateFor(c.status)} audience={audience} />
          </div>
          <p className="text-xs text-muted-foreground">
            Submitted {c.submittedAt ? formatDateTime(c.submittedAt) : ''} by {who(c.submittedBy, 'Subcontractor')}
            {c.completedOn ? ` · Completed ${formatDate(c.completedOn)}` : ''}
          </p>
          {c.completionNotes && <p className="whitespace-pre-wrap text-sm text-foreground">{c.completionNotes}</p>}
          <MediaGrid items={c.completion} emptyLabel="" evidence="repair" />

          {c.reviewedAt && (
            <div className="flex flex-col gap-2 rounded-md bg-muted p-3">
              <p className="text-sm font-medium text-foreground">
                Builder feedback: {DECISION_LABELS[c.status as ReviewDecision] ?? c.status}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(c.reviewedAt)} · {who(c.reviewedBy, 'Builder')}
              </p>
              {c.reviewNotes && <p className="whitespace-pre-wrap text-sm text-foreground">{c.reviewNotes}</p>}
              {c.inspection.length > 0 && <MediaGrid items={c.inspection} emptyLabel="" evidence="original" />}
              {issueLabels && c.linkedIssueIds.length > 0 && (
                <ul className="flex flex-col gap-1 text-sm">
                  {c.linkedIssueIds.map((id) => (
                    <li key={id} className="text-foreground">
                      Punch list: {issueLabels.get(id) ?? 'Linked item'}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </li>
      ))}
    </ol>
  )
}
