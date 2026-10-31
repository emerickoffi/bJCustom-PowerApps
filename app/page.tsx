import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { landingPathForRole } from '@/lib/navigation'
import { getSubcontractorSession } from '@/lib/subcontractor-session'

export default async function HomePage() {
  const session = await getSession()
  if (!session?.organizationId) {
    // Subcontractor portal users have no staff membership; send them to their workspace, not onboarding.
    const sub = await getSubcontractorSession()
    if (sub) redirect(sub.activationRequired ? '/sub/activate' : '/sub')
  }
  if (!session) redirect('/auth/login')
  if (!session.organizationId) redirect('/onboarding')
  redirect(landingPathForRole(session.role))
}
