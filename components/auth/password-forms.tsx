'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { requestPasswordResetAction, updatePasswordAction } from '@/app/actions/password'
import { initialActionState } from '@/lib/action-state'
import { TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(requestPasswordResetAction, initialActionState)
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <TextField name="email" label="Email" type="email" autoComplete="email" required defaultValue={state.values?.email} />
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Sending...">Send reset link</SubmitButton>
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/auth/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  )
}

export function UpdatePasswordForm() {
  const [state, formAction] = useActionState(updatePasswordAction, initialActionState)
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <TextField name="password" label="New password" type="password" autoComplete="new-password" required minLength={8} hint="At least 8 characters." />
      <TextField name="confirm" label="Confirm new password" type="password" autoComplete="new-password" required minLength={8} />
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Saving...">Set password</SubmitButton>
    </form>
  )
}
