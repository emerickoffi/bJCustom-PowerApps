'use client'

import { useActionState, useState, type ReactNode } from 'react'
import { BadgeCheck, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { ActionButton } from '@/components/shared/inline-action'
import { initialActionState } from '@/lib/action-state'
import {
  changeEstimateStatusAction,
  createEstimateRevisionAction,
  deleteDraftEstimateAction,
  duplicateEstimateAction,
  recordEstimateDecisionAction,
} from '@/app/actions/estimates'
import { DECISION_METHODS, DECISION_METHOD_LABELS, type EstimateStatus } from '@/lib/estimates'

function DecisionForm({ estimateId, defaultName }: { estimateId: string; defaultName: string }) {
  const [state, formAction] = useActionState(recordEstimateDecisionAction.bind(null, estimateId), initialActionState)
  const fe = state.fieldErrors ?? {}
  const v = state.values ?? {}
  const today = new Date().toISOString().slice(0, 10)
  const inputClass =
    'h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive'

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl border bg-card p-4" noValidate>
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold text-foreground">Record homeowner decision</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          This records a decision you received outside the app. It is not an electronic signature.
        </p>
      </div>
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="sr-only">Decision</legend>
        {(['approved', 'rejected'] as const).map((d) => (
          <label
            key={d}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium has-checked:border-primary has-checked:bg-primary/10 has-checked:text-primary"
          >
            <input type="radio" name="decision" value={d} defaultChecked={(v.decision ?? 'approved') === d} className="sr-only" />
            {d === 'approved' ? 'Approved' : 'Rejected'}
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Decided by</span>
        <input
          name="decision_by_name"
          defaultValue={v.decision_by_name ?? defaultName}
          aria-invalid={fe.decision_by_name ? true : undefined}
          className={inputClass}
        />
        {fe.decision_by_name && <span className="text-xs text-destructive">{fe.decision_by_name}</span>}
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Received via</span>
          <NativeSelect name="decision_method" defaultValue={v.decision_method ?? ''} aria-invalid={fe.decision_method ? true : undefined}>
            <option value="" disabled>
              Select
            </option>
            {DECISION_METHODS.map((m) => (
              <option key={m} value={m}>
                {DECISION_METHOD_LABELS[m]}
              </option>
            ))}
          </NativeSelect>
          {fe.decision_method && <span className="text-xs text-destructive">{fe.decision_method}</span>}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Decision date</span>
          <input type="date" name="decision_date" max={today} defaultValue={v.decision_date ?? today} className={inputClass} />
          {fe.decision_date && <span className="text-xs text-destructive">{fe.decision_date}</span>}
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Note (optional)</span>
        <textarea
          name="decision_note"
          maxLength={2000}
          defaultValue={v.decision_note ?? ''}
          className="min-h-20 rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>
      <FormMessage state={state} />
      <SubmitButton size="default">Record decision</SubmitButton>
    </form>
  )
}

export function EstimateWorkflow({
  estimateId,
  status,
  isLatest,
  hasOpenRevision,
  lineCount,
  clientName,
  canManage,
  signing,
}: {
  estimateId: string
  status: EstimateStatus
  isLatest: boolean
  hasOpenRevision: boolean
  lineCount: number
  clientName: string
  canManage: boolean
  signing?: ReactNode
}) {
  const [showDecision, setShowDecision] = useState(false)
  const locked = status === 'submitted' || status === 'approved' || status === 'rejected'

  return (
    <section aria-labelledby="workflow-heading" className="surface flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <h2 id="workflow-heading" className="font-serif text-lg font-semibold text-foreground">
          Workflow
        </h2>
        <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground" aria-label="Estimate stages">
          {(['draft', 'internal_review', 'submitted', status === 'rejected' ? 'rejected' : 'approved'] as const).map(
            (s, i, all) => (
              <li key={s} className="flex items-center gap-1">
                <span className={s === status ? 'font-semibold text-primary' : undefined}>
                  {{ draft: 'Draft', internal_review: 'Review', submitted: 'Submitted', approved: 'Approved', rejected: 'Rejected' }[s]}
                </span>
                {i < all.length - 1 && <span aria-hidden="true">{'→'}</span>}
              </li>
            ),
          )}
        </ol>
      </div>

      {status === 'approved' && (
        <p className="flex items-start gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
          <BadgeCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Approved version is preserved and cannot be edited. Create a revision for any changes.
        </p>
      )}
      {locked && status !== 'approved' && (
        <p className="flex items-start gap-2 rounded-lg bg-champagne-soft px-3 py-2 text-sm text-warning">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {status === 'submitted'
            ? 'Locked while the homeowner reviews it. Record their decision or create a revision.'
            : 'This version was rejected and is preserved for history.'}
        </p>
      )}
      {!isLatest && (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          A newer revision exists. This version is read-only history.
        </p>
      )}

      {canManage && isLatest && (
        <div className="flex flex-col gap-2">
          {status === 'draft' && (
            <ActionButton
              action={() => changeEstimateStatusAction(estimateId, 'internal_review')}
              label="Send to internal review"
              variant="outline"
              size="default"
            />
          )}
          {status === 'internal_review' && (
            <ActionButton
              action={() => changeEstimateStatusAction(estimateId, 'draft')}
              label="Return to draft"
              variant="outline"
              size="default"
            />
          )}
          {(status === 'draft' || status === 'internal_review') && (
            <ActionButton
              action={() => changeEstimateStatusAction(estimateId, 'submitted')}
              label={lineCount === 0 ? 'Add line items to submit' : 'Submit for homeowner review'}
              confirmMessage="Submitting locks this estimate. Continue?"
              variant="default"
              size="default"
            />
          )}
          {status === 'submitted' &&
            (showDecision ? (
              <DecisionForm estimateId={estimateId} defaultName={clientName} />
            ) : (
              <Button type="button" onClick={() => setShowDecision(true)}>
                Record approval or rejection
              </Button>
            ))}
          {locked && !hasOpenRevision && (
            <ActionButton
              action={() => createEstimateRevisionAction(estimateId)}
              label="Create revision"
              pendingLabel="Creating..."
              variant="outline"
              size="default"
            />
          )}
        </div>
      )}

      {signing}

      {canManage && (
        <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
          <ActionButton
            action={() => duplicateEstimateAction(estimateId)}
            label="Duplicate as new estimate"
            pendingLabel="Duplicating..."
          />
          {status === 'draft' && (
            <ActionButton
              action={() => deleteDraftEstimateAction(estimateId)}
              label="Delete draft"
              confirmMessage="Delete this draft estimate and its line items?"
              variant="destructive"
            />
          )}
        </div>
      )}
    </section>
  )
}
