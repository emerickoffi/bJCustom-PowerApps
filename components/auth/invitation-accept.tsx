'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { acceptInvitationAction } from '@/app/actions/invitations'
import { initialActionState } from '@/lib/action-state'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'

export function AcceptInvitationButton({ token, workspaceName }: { token: string; workspaceName: string }) {
  const [state, formAction] = useActionState(acceptInvitationAction, initialActionState)
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Joining...">{`Join ${workspaceName}`}</SubmitButton>
    </form>
  )
}

function signUpErrorMessage(error: unknown): string {
  const { code, status } = (error ?? {}) as { code?: string; status?: number }
  if (code === 'weak_password') return 'Please choose a stronger password.'
  if (code === 'email_address_not_authorized') return 'We cannot send a confirmation email to that address yet. Ask your administrator for help.'
  if (code === 'over_email_send_rate_limit' || status === 429) return 'Too many attempts. Please wait a moment and try again.'
  return 'Unable to create your account. If you already have one, sign in instead.'
}

export function InvitationSignUpForm({ token, email }: { token: string; email: string }) {
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const next = `/invite/${token}`

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== repeat) return setError('Passwords do not match.')
    setLoading(true)
    const callback = new URL(process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? `${window.location.origin}/auth/callback`)
    callback.searchParams.set('next', next)
    const { data, error } = await createClient().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: callback.toString(), data: { full_name: fullName.trim() } },
    })
    setLoading(false)
    if (error) return setError(signUpErrorMessage(error))
    // With confirmation off, sign-up returns a session and the invite page can accept immediately.
    if (data.session) return window.location.assign(next)
    setSent(true)
  }

  if (sent) {
    return (
      <p role="status" className="rounded-md bg-muted px-3 py-3 text-sm leading-relaxed text-foreground">
        {`Check ${email} for a confirmation link. Opening it brings you back here to join the workspace.`}
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="invite-email">Email</Label>
        <Input id="invite-email" type="email" value={email} readOnly aria-readonly="true" className="h-10 bg-muted" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="invite-name">Full name</Label>
        <Input id="invite-name" autoComplete="name" required maxLength={120} className="h-10" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="invite-password">Password</Label>
        <Input id="invite-password" type="password" autoComplete="new-password" required minLength={8} className="h-10" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="invite-repeat">Confirm password</Label>
        <Input id="invite-repeat" type="password" autoComplete="new-password" required minLength={8} className="h-10" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
      </div>
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="h-10" disabled={loading}>
        {loading ? 'Creating account...' : 'Create account and continue'}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {'Already have an account? '}
        <Link href={`/auth/login?next=${encodeURIComponent(next)}`} className="font-medium text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  )
}
