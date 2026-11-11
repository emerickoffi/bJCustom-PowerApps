import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { AuthShell } from '@/components/auth/auth-shell'
import { AcceptInvitationButton, InvitationSignUpForm } from '@/components/auth/invitation-accept'
import { ROLE_LABELS, type OrgRole } from '@/lib/domain'

export const metadata: Metadata = {
  title: 'Accept invitation',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
}

type Preview = { status: string; email: string; role: OrgRole; organization_name: string; expires_at: string }

const DEAD_STATES: Record<string, { title: string; description: string }> = {
  invalid: { title: 'Invitation not found', description: 'This invitation link is not valid. Check that you copied the whole link, or ask your administrator for a new invitation.' },
  revoked: { title: 'Invitation revoked', description: 'This invitation was revoked by an administrator. Ask them for a new invitation if you still need access.' },
  expired: { title: 'Invitation expired', description: 'This invitation has expired. Ask your administrator to issue a new link.' },
  accepted: { title: 'Invitation already used', description: 'This invitation has already been accepted. If it was you, sign in to continue.' },
}

function SignOutToSwitch({ next, label }: { next: string; label: string }) {
  return (
    <form action="/auth/sign-out" method="post">
      <input type="hidden" name="next" value={next} />
      <button type="submit" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
        {label}
      </button>
    </form>
  )
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()
  const [{ data }, { data: auth }] = await Promise.all([
    supabase.rpc('invitation_preview', { p_token: token }),
    supabase.auth.getUser(),
  ])
  const preview = ((data ?? []) as Preview[])[0]
  const user = auth.user
  const here = `/invite/${token}`

  const state = preview?.status ?? 'invalid'
  if (state !== 'pending') {
    const dead = DEAD_STATES[state] ?? DEAD_STATES.invalid
    return (
      <AuthShell title={dead.title} description={dead.description}>
        <Link href={user ? '/' : '/auth/login'} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          {user ? 'Continue' : 'Go to sign in'}
        </Link>
      </AuthShell>
    )
  }

  const workspace = preview.organization_name
  const description = `You have been invited to join ${workspace} as ${ROLE_LABELS[preview.role] ?? 'a team member'}.`

  if (!user) {
    return (
      <AuthShell title={`Join ${workspace}`} description={`${description} Create your account with ${preview.email} to continue.`}>
        <InvitationSignUpForm token={token} email={preview.email} />
      </AuthShell>
    )
  }

  if ((user.email ?? '').toLowerCase() !== preview.email.toLowerCase()) {
    return (
      <AuthShell
        title="Wrong account"
        description={`This invitation is for ${preview.email}, but you are signed in as ${user.email}. Sign out, then sign in or create an account with the invited email.`}
      >
        <SignOutToSwitch next={here} label="Sign out and switch account" />
      </AuthShell>
    )
  }

  if (!user.email_confirmed_at) {
    return (
      <AuthShell title="Confirm your email" description={`Open the confirmation link we sent to ${preview.email}, then return to this invitation.`}>
        <SignOutToSwitch next={here} label="Sign out" />
      </AuthShell>
    )
  }

  return (
    <AuthShell title={`Join ${workspace}`} description={description}>
      <AcceptInvitationButton token={token} workspaceName={workspace} />
    </AuthShell>
  )
}
