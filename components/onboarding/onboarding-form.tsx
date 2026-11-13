'use client'

import { useActionState } from 'react'
import { createOrganizationAction } from '@/app/actions/organization'
import { initialActionState } from '@/lib/action-state'
import { TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { StateSelect } from '@/components/shared/state-select'

export function OnboardingForm() {
  const [state, formAction] = useActionState(createOrganizationAction, initialActionState)
  const fe = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <TextField
        name="display_name"
        label="Company display name"
        required
        placeholder="Acme Custom Homes"
        error={fe.display_name}
      />
      <TextField
        name="legal_name"
        label="Legal business name"
        placeholder="Acme Custom Homes, LLC"
        error={fe.legal_name}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField name="phone" label="Phone" type="tel" autoComplete="tel" error={fe.phone} />
        <TextField name="email" label="Company email" type="email" error={fe.email} />
        <TextField name="city" label="City" error={fe.city} />
        <StateSelect name="state" error={fe.state} />
      </div>
      <TextField
        name="project_prefix"
        label="Project number prefix"
        required
        defaultValue="BJ"
        maxLength={6}
        hint="Projects will be numbered like BJ-1001."
        error={fe.project_prefix}
      />
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Creating workspace..." className="h-10">
        Create workspace
      </SubmitButton>
    </form>
  )
}
