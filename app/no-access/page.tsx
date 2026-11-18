import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { isPlatformAdmin } from '@/lib/platform'
import { selfSignupOpen } from '@/lib/signup'
import { AuthShell } from '@/components/auth/auth-shell'

export const metadata: Metadata = { title: 'No workspace access', robots: { index: false, follow: false } }

export default async function NoAccessPage() {
  const session = await getSession()
  if (!session) redirect('/auth/login')
  if (session.organizationId && session.role) redirect('/')
  const platformAdmin = await isPlatformAdmin()
  const paused = session.suspendedWorkspaces

  const signOut = (
    <form action="/auth/sign-out" method="post">
      <button type="submit" className="font-medium text-primary underline-offset-4 hover:underline">
        Sign out
      </button>
    </form>
  )
  const ownerLink = platformAdmin && (
    <Link href="/platform" className="font-medium text-primary underline-offset-4 hover:underline">
      Open the Trefort owner console
    </Link>
  )

  if (paused.length > 0) {
    const names = paused.map((w) => w.organizationName).join(', ')
    return (
      <AuthShell title="Workspace paused" description={`Access to ${names} is paused right now.`}>
        <div className="flex flex-col gap-4 text-sm leading-relaxed text-muted-foreground">
          <p>
            {'Your account and all of the company’s projects, files and records are safe. Access comes back as soon as the workspace is reactivated.'}
          </p>
          <p>{'If you manage this company, contact Trefort support about your subscription.'}</p>
          {ownerLink}
          {signOut}
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="No workspace access"
      description={`You are signed in as ${session.email}, but this account is not a member of any workspace yet.`}
    >
      <div className="flex flex-col gap-4 text-sm leading-relaxed text-muted-foreground">
        {selfSignupOpen() && (
          <Link
            href="/onboarding"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 font-medium text-primary-foreground hover:bg-primary/90"
          >
            Create your company · 14-day free trial
          </Link>
        )}
        <p>
          {selfSignupOpen() ? 'Joining an existing company? ' : 'Access is by invitation only. '}
          {'Ask your administrator to send an invitation to this email address, then open the invitation link they share with you.'}
        </p>
        <p>{'If you were invited with a different email, sign out and sign in with that address.'}</p>
        {ownerLink}
        {signOut}
      </div>
    </AuthShell>
  )
}
