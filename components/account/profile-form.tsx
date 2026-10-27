'use client'

import { useActionState } from 'react'
import { updateProfileAction } from '@/app/actions/organization'
import { initialActionState } from '@/lib/action-state'
import { TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'

export function ProfileForm({ fullName, phone, email }: { fullName: string; phone: string; email: string }) {
  const [state, formAction] = useActionState(updateProfileAction, initialActionState)
  const fe = state.fieldErrors ?? {}
  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-5 rounded-xl border bg-card p-6">
      <TextField name="full_name" label="Full name" required defaultValue={fullName} error={fe.full_name} autoComplete="name" />
      <TextField name="phone" label="Phone" type="tel" defaultValue={phone} error={fe.phone} autoComplete="tel" />
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">Email</span>
        <span className="text-sm text-muted-foreground">{email}</span>
      </div>
      <FormMessage state={state} />
      <div className="flex justify-end">
        <SubmitButton>Save profile</SubmitButton>
      </div>
    </form>
  )
}
