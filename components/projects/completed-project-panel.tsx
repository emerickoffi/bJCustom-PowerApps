'use client'

import { useState } from 'react'
import { CircleCheck, ShieldAlert, ShieldCheck } from 'lucide-react'
import { resolveCompletionExceptionAction } from '@/app/actions/project-completion'
import { InlineActionForm } from '@/components/shared/inline-action'
import { TextAreaField } from '@/components/shared/form-field'
import { SubmitButton } from '@/components/shared/form-message'
import { Button } from '@/components/ui/button'
import { formatDate, formatDateTime } from '@/lib/format'

export interface CompletedExceptionView {
  id: string
  label: string
  detail: string | null
  reason: string
  justification: string
  followUpName: string
  targetDate: string | null
  evidence: string | null
  approvedByName: string
  approvedAt: string
  status: 'open' | 'resolved'
  resolvedByName: string | null
  resolvedAt: string | null
  resolutionNote: string | null
  canResolve: boolean
}

function ResolveForm({ projectId, exceptionId }: { projectId: string; exceptionId: string }) {
  const [open, setOpen] = useState(false)
  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="self-start">
        Mark resolved
      </Button>
    )
  }
  return (
    <InlineActionForm action={resolveCompletionExceptionAction} className="flex flex-col gap-3">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="exception_id" value={exceptionId} />
      <TextAreaField name="note" label="Resolution note" required minLength={10} maxLength={2000} rows={3} placeholder="How was this item resolved?" />
      <div className="flex gap-2">
        <SubmitButton pendingLabel="Saving...">Save resolution</SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </InlineActionForm>
  )
}

export function CompletedProjectPanel({
  projectId,
  completionDate,
  warrantyStart,
  review,
  exceptions,
}: {
  projectId: string
  completionDate: string | null
  warrantyStart: string | null
  review: { outcome: 'ready' | 'with_exceptions'; approvedByName: string; approvedAt: string; note: string | null } | 'legacy' | 'unavailable'
  exceptions: CompletedExceptionView[]
}) {
  const openCount = exceptions.filter((e) => e.status === 'open').length
  return (
    <section aria-labelledby="closeout-heading" className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-1.5">
        <h2 id="closeout-heading" className="flex items-center gap-2 font-serif text-lg font-semibold text-foreground">
          <CircleCheck className="size-4.5 text-primary" aria-hidden="true" />
          Project closeout
        </h2>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Completed</dt>
            <dd className="font-medium text-foreground">{completionDate ? formatDate(completionDate) : 'Date not recorded'}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Warranty since</dt>
            <dd className="font-medium text-foreground">{warrantyStart ? formatDate(warrantyStart) : 'Not set up'}</dd>
          </div>
          {typeof review === 'object' && (
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">Approved by</dt>
              <dd className="font-medium text-foreground">{`${review.approvedByName}, ${formatDateTime(review.approvedAt)}`}</dd>
            </div>
          )}
        </dl>
      </div>

      {review === 'legacy' && (
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
          This project was completed before completion readiness reviews were introduced. Historical records are shown as originally recorded.
        </p>
      )}
      {typeof review === 'object' && review.outcome === 'ready' && (
        <p className="flex items-center gap-2 text-sm text-foreground">
          <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
          All applicable readiness requirements were verified at completion.
        </p>
      )}
      {typeof review === 'object' && review.note && <p className="text-sm text-muted-foreground">{review.note}</p>}

      {exceptions.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldAlert className="size-4 text-warning" aria-hidden="true" />
            {`Completed with exceptions · ${openCount} open`}
          </h3>
          <ul className="grid gap-3 lg:grid-cols-2">
            {exceptions.map((e) => (
              <li key={e.id} className="flex flex-col gap-2 rounded-xl border bg-background p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm font-medium text-foreground">{e.label}</span>
                  <span
                    className={
                      e.status === 'open'
                        ? 'shrink-0 rounded-full bg-champagne-soft px-2 py-0.5 text-xs font-medium text-warning'
                        : 'shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary'
                    }
                  >
                    {e.status === 'open' ? 'Exception approved' : 'Resolved'}
                  </span>
                </div>
                {e.detail && <p className="text-xs text-muted-foreground">{`At completion: ${e.detail}`}</p>}
                <p className="text-sm text-foreground">
                  <span className="font-medium">{`${e.reason}. `}</span>
                  {e.justification}
                </p>
                <p className="text-xs text-muted-foreground">
                  {`Follow-up: ${e.followUpName}${e.targetDate ? ` by ${formatDate(e.targetDate)}` : ''} · Approved by ${e.approvedByName}`}
                </p>
                {e.evidence && <p className="break-words text-xs text-muted-foreground">{`Evidence: ${e.evidence}`}</p>}
                {e.status === 'resolved' ? (
                  <p className="text-xs text-muted-foreground">
                    {`Resolved by ${e.resolvedByName ?? 'team member'}${e.resolvedAt ? ` on ${formatDate(e.resolvedAt)}` : ''}: ${e.resolutionNote ?? ''}`}
                  </p>
                ) : (
                  e.canResolve && <ResolveForm projectId={projectId} exceptionId={e.id} />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
