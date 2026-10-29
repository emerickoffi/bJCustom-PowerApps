'use client'

import { useActionState, useState } from 'react'
import { decideChangeOrderAction, transitionChangeOrderAction } from '@/app/actions/change-orders'
import { initialActionState } from '@/lib/action-state'
import { CHANGE_ORDER_DECISION_METHODS, allowedTransitions, type ChangeOrderStatus } from '@/lib/change-orders'
import { SelectField, TextAreaField, TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { Button } from '@/components/ui/button'

type Props = {
  projectId: string
  id: string
  status: ChangeOrderStatus
  version: number
  today: string
  signatureOptions: { id: string; title: string }[]
}

const TRANSITION_COPY: Partial<Record<ChangeOrderStatus, { label: string; variant?: 'outline' | 'default' }>> = {
  internal_review: { label: 'Submit for internal review' },
  awaiting_homeowner: { label: 'Mark as sent to homeowner' },
  draft: { label: 'Return to draft', variant: 'outline' },
}

export function ChangeOrderWorkflow({ projectId, id, status, version, today, signatureOptions }: Props) {
  const [state, transition] = useActionState(transitionChangeOrderAction, initialActionState)
  const [mode, setMode] = useState<'none' | 'approved' | 'rejected' | 'void'>('none')
  const allowed = allowedTransitions(status)
  if (allowed.length === 0) return null

  const hidden = (
    <>
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
    </>
  )

  return (
    <section aria-labelledby="co-workflow-heading" className="flex flex-col gap-4 rounded-xl border border-border/80 bg-card p-5 shadow-xs">
      <div className="flex flex-col gap-1">
        <h2 id="co-workflow-heading" className="text-sm font-semibold text-foreground">
          Next step
        </h2>
        {status === 'awaiting_homeowner' && (
          <p className="text-sm text-muted-foreground">
            Record the homeowner&apos;s decision once you have it. Returning to draft starts version {version + 1} so the decision always matches what they saw.
          </p>
        )}
      </div>
      <FormMessage state={state} />
      <div className="flex flex-wrap gap-2">
        {(['internal_review', 'awaiting_homeowner', 'draft'] as const)
          .filter((to) => allowed.includes(to))
          .map((to) => (
            <form key={to} action={transition}>
              {hidden}
              <input type="hidden" name="to" value={to} />
              <SubmitButton size="default" variant={TRANSITION_COPY[to]?.variant} pendingLabel="Updating...">
                {TRANSITION_COPY[to]?.label}
              </SubmitButton>
            </form>
          ))}
        {allowed.includes('approved') && (
          <Button type="button" onClick={() => setMode('approved')} aria-pressed={mode === 'approved'}>
            Record approval
          </Button>
        )}
        {allowed.includes('rejected') && (
          <Button type="button" variant="outline" onClick={() => setMode('rejected')} aria-pressed={mode === 'rejected'}>
            Record rejection
          </Button>
        )}
        <Button type="button" variant="ghost" className="text-destructive" onClick={() => setMode('void')} aria-pressed={mode === 'void'}>
          Void
        </Button>
      </div>

      {mode === 'void' && (
        <form action={transition} className="flex flex-col gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
          {hidden}
          <input type="hidden" name="to" value="void" />
          <TextAreaField name="note" label="Reason for voiding" required maxLength={2000} error={state.fieldErrors?.note} />
          <p className="text-xs text-muted-foreground">Voided change orders stay on record and never affect the budget.</p>
          <div className="flex gap-2">
            <SubmitButton size="default" variant="destructive" pendingLabel="Voiding...">
              Void change order
            </SubmitButton>
            <Button type="button" variant="outline" onClick={() => setMode('none')}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {(mode === 'approved' || mode === 'rejected') && (
        <DecisionForm
          key={mode}
          decision={mode}
          hidden={hidden}
          today={today}
          signatureOptions={signatureOptions}
          onCancel={() => setMode('none')}
        />
      )}
    </section>
  )
}

function DecisionForm({
  decision,
  hidden,
  today,
  signatureOptions,
  onCancel,
}: {
  decision: 'approved' | 'rejected'
  hidden: React.ReactNode
  today: string
  signatureOptions: { id: string; title: string }[]
  onCancel: () => void
}) {
  const [state, action] = useActionState(decideChangeOrderAction, initialActionState)
  const fe = state.fieldErrors ?? {}
  const v = state.values
  return (
    <form action={action} className="grid gap-4 rounded-lg border border-border/70 bg-muted/30 p-4 sm:grid-cols-2">
      {hidden}
      <input type="hidden" name="decision" value={decision} />
      <TextField name="decision_by_name" label="Homeowner name" required defaultValue={v?.decision_by_name} error={fe.decision_by_name} maxLength={160} />
      <SelectField
        name="decision_method"
        label="How it was communicated"
        required
        placeholder="Choose a method"
        defaultValue={v?.decision_method}
        options={CHANGE_ORDER_DECISION_METHODS.map((m) => ({ value: m.value, label: m.label }))}
        error={fe.decision_method}
      />
      <TextField name="decision_date" label="Decision date" type="date" required max={today} defaultValue={v?.decision_date ?? today} error={fe.decision_date} />
      {signatureOptions.length > 0 ? (
        <SelectField
          name="signature_request_id"
          label="Signed document (optional)"
          placeholder="None"
          defaultValue={v?.signature_request_id}
          options={signatureOptions.map((s) => ({ value: s.id, label: s.title }))}
          hint="Completed signature requests on this project. Kept as evidence only."
        />
      ) : (
        <p className="self-end text-xs text-muted-foreground">No completed signature requests on this project to attach as evidence.</p>
      )}
      <TextAreaField name="decision_note" label="Note" className="sm:col-span-2" defaultValue={v?.decision_note} maxLength={2000} />
      <div className="flex flex-col gap-3 sm:col-span-2">
        <FormMessage state={state} />
        <div className="flex gap-2">
          <SubmitButton size="default" variant={decision === 'rejected' ? 'outline' : undefined} pendingLabel="Recording...">
            {decision === 'approved' ? 'Record approval' : 'Record rejection'}
          </SubmitButton>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </form>
  )
}
