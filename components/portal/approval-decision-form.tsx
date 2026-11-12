'use client'

import { useActionState, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, MessageSquareText, X } from 'lucide-react'
import { decidePortalApprovalAction } from '@/app/actions/portal-approvals'
import { initialActionState } from '@/lib/action-state'
import type { ApprovalDecision, ApprovalDocumentType } from '@/lib/portal-approvals'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

const CHOICES: { value: ApprovalDecision; label: string; hint: string; icon: typeof Check }[] = [
  { value: 'approved', label: 'Approve', hint: 'Accept this document as written.', icon: Check },
  { value: 'changes_requested', label: 'Request changes', hint: 'Ask your builder to revise it.', icon: MessageSquareText },
  { value: 'rejected', label: 'Decline', hint: 'Do not proceed with this document.', icon: X },
]

export function ApprovalDecisionForm({
  type,
  id,
  revision,
  amountCents,
  amountLabel,
  documentLabel,
}: {
  type: ApprovalDocumentType
  id: string
  revision: number
  amountCents: number
  amountLabel: string
  documentLabel: string
}) {
  const router = useRouter()
  const [state, dispatch, pending] = useActionState(decidePortalApprovalAction, initialActionState)
  const [decision, setDecision] = useState<ApprovalDecision | null>(null)
  // One key per decision attempt, so a double click or retried request records a single decision.
  const requestKey = useRef<{ decision: ApprovalDecision; key: string } | null>(null)

  function submit(formData: FormData) {
    const chosen = formData.get('decision') as ApprovalDecision | null
    if (chosen && requestKey.current?.decision !== chosen) {
      requestKey.current = { decision: chosen, key: crypto.randomUUID() }
    }
    if (requestKey.current) formData.set('request_key', requestKey.current.key)
    dispatch(formData)
  }

  const fieldErrors = state.fieldErrors ?? {}
  const submitLabel =
    decision === 'approved' ? `Approve ${documentLabel}` : decision === 'rejected' ? `Decline ${documentLabel}` : decision === 'changes_requested' ? 'Send requested changes' : 'Choose a decision'

  if (state.success) {
    return (
      <div role="status" className="rounded-xl border border-primary/20 bg-sage/50 p-5 text-sm text-foreground">
        {state.success}
      </div>
    )
  }

  return (
    <form action={submit} className="flex flex-col gap-5" aria-describedby={state.error ? 'decision-error' : undefined}>
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="revision" value={revision} />
      <input type="hidden" name="expected_amount" value={amountCents} />

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-sm font-medium text-foreground">Your decision</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {CHOICES.map((c) => {
            const Icon = c.icon
            const selected = decision === c.value
            return (
              <label
                key={c.value}
                className={cn(
                  'flex cursor-pointer flex-col gap-1 rounded-xl border p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                  selected
                    ? c.value === 'rejected'
                      ? 'border-destructive bg-destructive/5'
                      : 'border-primary bg-sage/60'
                    : 'border-border hover:border-primary/40',
                )}
              >
                <input
                  type="radio"
                  name="decision"
                  value={c.value}
                  className="sr-only"
                  checked={selected}
                  onChange={() => setDecision(c.value)}
                />
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Icon className="size-4" aria-hidden="true" />
                  {c.label}
                </span>
                <span className="text-xs text-muted-foreground">{c.hint}</span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="decision-comment">
          {decision === 'changes_requested' ? 'What would you like changed?' : 'Comment for your builder (optional)'}
        </Label>
        <Textarea
          id="decision-comment"
          name="comment"
          rows={4}
          maxLength={2000}
          required={decision === 'changes_requested'}
          aria-invalid={Boolean(fieldErrors.comment)}
          aria-describedby={fieldErrors.comment ? 'decision-comment-error' : undefined}
          placeholder={decision === 'changes_requested' ? 'For example: use the upgraded tile allowance in the primary bath.' : undefined}
        />
        {fieldErrors.comment && (
          <p id="decision-comment-error" className="text-sm text-destructive">
            {fieldErrors.comment}
          </p>
        )}
      </div>

      {decision === 'approved' && (
        <div className="flex flex-col gap-2 rounded-xl border bg-muted/40 p-4">
          <label className="flex items-start gap-3 text-sm leading-relaxed text-foreground">
            <input
              type="checkbox"
              name="acknowledged"
              required
              className="mt-1 size-4 shrink-0 accent-primary"
              aria-invalid={Boolean(fieldErrors.acknowledged)}
            />
            <span>{`I have reviewed this ${documentLabel} and approve it at ${amountLabel}. I understand my approval is recorded with my name and the time.`}</span>
          </label>
          {fieldErrors.acknowledged && <p className="text-sm text-destructive">{fieldErrors.acknowledged}</p>}
        </div>
      )}

      {state.error && (
        <div id="decision-error" role="alert" className="flex flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <span>{state.error}</span>
          {state.conflict && (
            <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => router.refresh()}>
              Refresh
            </Button>
          )}
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        variant={decision === 'rejected' ? 'destructive' : 'default'}
        disabled={!decision || pending}
        className="self-start"
      >
        {pending ? 'Recording your decision…' : submitLabel}
      </Button>
    </form>
  )
}
