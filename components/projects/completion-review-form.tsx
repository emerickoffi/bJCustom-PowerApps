'use client'

import { useActionState } from 'react'
import { completeProjectAction } from '@/app/actions/project-completion'
import { initialActionState } from '@/lib/action-state'
import { SelectField, TextAreaField, TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'

export function CompletionReviewForm({
  projectId,
  today,
  blockers,
  staff,
  defaultFollowUp,
}: {
  projectId: string
  today: string
  blockers: { key: string; label: string; detail: string }[]
  staff: { value: string; label: string }[]
  defaultFollowUp: string | undefined
}) {
  const [state, formAction] = useActionState(completeProjectAction, initialActionState)
  const withExceptions = blockers.length > 0

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="project_id" value={projectId} />

      {withExceptions && (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-sm font-semibold text-foreground">Exceptions to approve</legend>
          <p className="text-sm text-muted-foreground">
            Each outstanding requirement needs a documented reason, a substantive justification and a team member responsible for follow-up. Exceptions stay visible on the project until resolved.
          </p>
          {blockers.map((b) => {
            const p = `exception_${b.key}_`
            return (
              <div key={b.key} className="flex flex-col gap-4 rounded-xl border bg-background p-4">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">{b.label}</span>
                  <span className="text-xs text-muted-foreground">{b.detail}</span>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <TextField name={`${p}reason`} label="Reason" required minLength={3} maxLength={200} placeholder="e.g. Homeowner requested early move-in" />
                  <SelectField name={`${p}follow_up`} label="Follow-up owner" required options={staff} defaultValue={defaultFollowUp} placeholder="Choose a team member" />
                  <TextAreaField
                    name={`${p}justification`}
                    label="Justification"
                    required
                    minLength={20}
                    maxLength={2000}
                    rows={3}
                    className="md:col-span-2"
                    placeholder="Why can the project be completed while this remains outstanding?"
                  />
                  <TextField name={`${p}target_date`} label="Target resolution date" type="date" min={today} />
                  <TextField name={`${p}evidence`} label="Evidence reference" maxLength={500} placeholder="Optional document, photo or note reference" />
                </div>
              </div>
            )
          })}
        </fieldset>
      )}

      <fieldset className="grid gap-4 md:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold text-foreground">Completion details</legend>
        <TextField name="completion_date" label="Actual completion date" type="date" required max={today} defaultValue={today} hint="Warranty coverage starts on this date." />
        <TextField name="note" label="Note" maxLength={500} placeholder="Optional closeout note for the status history" />
      </fieldset>

      <label className="flex items-start gap-3 rounded-xl border bg-muted/40 p-4 text-sm text-foreground">
        <input type="checkbox" name="confirm" value="yes" required className="mt-0.5 size-4 accent-[var(--primary)]" />
        <span>
          {withExceptions
            ? 'I reviewed the outstanding requirements above and approve completing this project with these exceptions.'
            : 'I confirm the readiness review above reflects the current project records.'}
        </span>
      </label>

      <FormMessage state={state} />
      <SubmitButton pendingLabel="Completing..." className="self-start">
        {withExceptions ? 'Complete with exceptions' : 'Mark project completed'}
      </SubmitButton>
    </form>
  )
}
