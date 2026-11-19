import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { selfSignupOpen } from '@/lib/signup'
import { AuthShell } from '@/components/auth/auth-shell'
import { OnboardingForm } from '@/components/onboarding/onboarding-form'

export const metadata: Metadata = { title: 'Create your company', robots: { index: false, follow: false } }

// A signed-in person with no workspace creates their company here and starts a 14-day Business trial (every module).
// Closed unless self sign-up is switched on; invited people never need this page.
export default async function OnboardingPage() {
  const session = await getSession()
  if (!session) redirect('/auth/sign-up')
  if (session.organizationId) redirect('/')
  if (!selfSignupOpen() || session.suspendedWorkspaces.length > 0) redirect('/no-access')

  return (
    <AuthShell
      title="Create your company"
      description="Try every Trefort module free for 14 days, including the AI assistant. No credit card needed. Choose a plan any time before the trial ends."
    >
      <OnboardingForm />
    </AuthShell>
  )
}
