'use client'

import { Suspense, use } from 'react'
import { AlertTriangle, ListChecks } from 'lucide-react'
import type { IssuePanelResult } from '@/app/actions/issue-panel'
import { IssueStatusBadge, PriorityBadge } from '@/components/walkthroughs/badges'
import { MediaGrid } from '@/components/walkthroughs/media-uploader'
import { IssueTimeline } from '@/components/walkthroughs/issue-timeline'
import { DetailList } from '@/components/shared/page-header'
import { PanelError, PanelLoading, PanelSection, RecordPanel } from '@/components/shared/record-panel'
import { isOverdue } from '@/lib/walkthroughs'
import { formatDate, formatDateTime } from '@/lib/format'

export type IssuePanelState = { issueId: string; label: string; request: Promise<IssuePanelResult> }

export function IssuePanel({
  projectId,
  state,
  onRetry,
  onClose,
}: {
  projectId: string
  state: IssuePanelState | null
  onRetry: () => void
  onClose: () => void
}) {
  return (
    <RecordPanel
      open={Boolean(state)}
      onClose={onClose}
      icon={ListChecks}
      title={state?.label ?? 'Issue'}
      description="Punch list issue"
      fullHref={state ? `/projects/${projectId}/issues/${state.issueId}` : undefined}
    >
      {state && (
        <Suspense fallback={<PanelLoading label="Loading issue" />}>
          <IssuePanelBody request={state.request} onRetry={onRetry} />
        </Suspense>
      )}
    </RecordPanel>
  )
}

function IssuePanelBody({ request, onRetry }: { request: Promise<IssuePanelResult>; onRetry: () => void }) {
  const res = use(request)
  if (!res.ok) return <PanelError message={res.error} onRetry={onRetry} />
  const issue = res.data
  const overdue = isOverdue(issue.dueDate, issue.status)
  const evidence = [...issue.original, ...issue.supplemental]

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <IssueStatusBadge status={issue.status} />
        <PriorityBadge priority={issue.priority} />
        <span className="text-xs text-muted-foreground">{issue.category}</span>
      </div>

      <DetailList
        items={[
          { label: 'Assigned to', value: issue.assignee ?? 'Unassigned' },
          {
            label: 'Due date',
            value: issue.dueDate ? (
              <span className={overdue ? 'flex items-center gap-1.5 text-destructive' : undefined}>
                {overdue && <AlertTriangle className="size-4" aria-hidden="true" />}
                {formatDate(issue.dueDate)}
                {overdue && <span className="sr-only"> (overdue)</span>}
              </span>
            ) : (
              'Not set'
            ),
          },
          { label: 'Reported by', value: issue.reporter },
          { label: 'Reported', value: formatDateTime(issue.reportedAt) },
        ]}
      />

      {issue.description && (
        <PanelSection title="Observation">
          <blockquote className="whitespace-pre-line rounded-lg border-l-4 border-primary bg-primary/5 p-3 text-sm leading-relaxed text-foreground">
            {issue.description}
          </blockquote>
        </PanelSection>
      )}

      <PanelSection title="Issue photos">
        <MediaGrid evidence="original" items={evidence} emptyLabel="No photos were attached." />
      </PanelSection>

      <PanelSection title="Corrective action">
        <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
          {issue.correctiveAction || <span className="text-muted-foreground">Not documented yet.</span>}
        </p>
        {issue.repair.length > 0 && <MediaGrid evidence="repair" items={issue.repair} emptyLabel="" />}
      </PanelSection>

      <PanelSection title="Comments" aside={issue.notes.length >= 20 ? <span className="text-xs text-muted-foreground">Latest 20</span> : undefined}>
        {issue.notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No comments yet.</p>
        ) : (
          <ol className="flex flex-col divide-y rounded-lg border bg-muted/30">
            {issue.notes.map((n) => (
              <li key={n.id} className="flex flex-col gap-1 p-3">
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{n.body}</p>
                <span className="text-xs text-muted-foreground">
                  {`${n.author} · ${formatDateTime(n.createdAt)} · ${n.shared ? 'Visible to homeowner' : 'Staff only'}`}
                </span>
              </li>
            ))}
          </ol>
        )}
      </PanelSection>

      <PanelSection title="Recent activity">
        <IssueTimeline events={issue.events} nameFor={(id) => (id ? issue.names[id] ?? 'Team member' : null)} />
      </PanelSection>

      <p className="text-xs text-muted-foreground">Update status, add photos, approve repairs, and reply from the full issue page.</p>
    </>
  )
}
