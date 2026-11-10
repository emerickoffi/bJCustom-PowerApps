import Link from 'next/link'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import { formatDate, formatDateTime } from '@/lib/format'
import { workStateFor, type SubmissionStatus } from '@/lib/subcontractor-work'
import { WorkStateBadge } from '@/components/subcontractor-work/work-state-badge'

export type QueueRow = {
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

/** `setup` when the feature's tables are missing in this environment, `query` when the read itself failed. */
export type QueueFailure = 'setup' | 'query' | null

export function WorkQueue({ projectId, rows, failure }: { projectId: string; rows: QueueRow[]; failure: QueueFailure }) {
  if (failure === 'setup') {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        Subcontractor work verification is not set up in this environment yet.
      </p>
    )
  }
  if (failure === 'query') {
    return (
      <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Submissions could not be loaded. Refresh the page to try again.
      </p>
    )
  }
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No work submissions yet.</p>

  const awaiting = rows.filter((r) => r.status === 'submitted').sort((a, b) => (a.submitted_at ?? '').localeCompare(b.submitted_at ?? ''))
  const reviewed = rows.filter((r) => r.status !== 'submitted')
  return (
    <>
      <QueueSection
        headingId="awaiting-heading"
        title="Awaiting verification"
        rows={awaiting}
        projectId={projectId}
        empty="Nothing is waiting on you."
      />
      <QueueSection headingId="reviewed-heading" title="Reviewed" rows={reviewed} projectId={projectId} empty="No reviewed submissions yet." />
    </>
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
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {title}
        <span className="rounded-badge bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
          {rows.length}
          <span className="sr-only">{rows.length === 1 ? ' submission' : ' submissions'}</span>
        </span>
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/projects/${projectId}/subcontractor-work/${r.id}`}
                className="flex items-center gap-x-4 gap-y-1.5 px-3 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring max-sm:flex-wrap sm:px-4"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 max-sm:basis-[calc(100%-2rem)]">
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
                <ChevronRight className="size-4 shrink-0 text-muted-foreground sm:order-last" aria-hidden="true" />
                <WorkStateBadge state={workStateFor(r.status)} audience="builder" className="shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function targetLabel(r: QueueRow) {
  if (r.submission_kind === 'work') return r.assignment?.activity?.name ?? 'Schedule activity'
  return r.issue?.item_label || r.issue?.category || 'Punch list item'
}
