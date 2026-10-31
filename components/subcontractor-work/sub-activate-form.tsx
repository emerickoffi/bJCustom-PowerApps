'use client'

import { useActionState } from 'react'
import { activateSubcontractorAction } from '@/app/actions/subcontractor-portal'
import { initialActionState } from '@/lib/action-state'
import { TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'

export function SubActivateForm() {
  const [state, formAction] = useActionState(activateSubcontractorAction, initialActionState)
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <TextField
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        minLength={12}
        hint="At least 12 characters."
        error={state.fieldErrors?.password}
      />
      <TextField name="confirm" label="Confirm new password" type="password" autoComplete="new-password" required error={state.fieldErrors?.confirm} />
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Activating...">Activate account</SubmitButton>
    </form>
  )
}
