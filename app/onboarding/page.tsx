import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { AuthShell } from '@/components/auth/auth-shell'
import { OnboardingForm } from '@/components/onboarding/onboarding-form'

export const metadata: Metadata = { title: 'Set up your organization' }

export default async function OnboardingPage() {
  const session = await getSession()
  if (!session) redirect('/auth/login')
  if (session.organizationId) redirect('/')

  return (
    <AuthShell
      title="Set up your organization"
      description="Create your builder workspace. If your company already uses the platform, ask an administrator to invite you instead, then sign in again with the invited email."
    >
      <OnboardingForm />
      <form action="/auth/sign-out" method="post" className="mt-4 text-center">
        <button type="submit" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          {`Signed in as ${session.email} — sign out`}
        </button>
      </form>
    </AuthShell>
  )
}
