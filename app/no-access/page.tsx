import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { AuthShell } from '@/components/auth/auth-shell'

export const metadata: Metadata = { title: 'No workspace access', robots: { index: false, follow: false } }

export default async function NoAccessPage() {
  const session = await getSession()
  if (!session) redirect('/auth/login')
  if (session.organizationId && session.role) redirect('/')

  return (
    <AuthShell
      title="No workspace access"
      description={`You are signed in as ${session.email}, but this account is not a member of any workspace yet.`}
    >
      <div className="flex flex-col gap-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          {'Access is by invitation only. Ask your administrator to send an invitation to this email address, then open the invitation link they share with you.'}
        </p>
        <p>{'If you were invited with a different email, sign out and sign in with that address.'}</p>
        <form action="/auth/sign-out" method="post">
          <button type="submit" className="font-medium text-primary underline-offset-4 hover:underline">
            Sign out
          </button>
        </form>
      </div>
    </AuthShell>
  )
}
