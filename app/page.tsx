import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { landingPathForRole } from '@/lib/navigation'

export default async function HomePage() {
  const session = await getSession()
  if (!session) redirect('/auth/login')
  if (!session.organizationId) redirect('/onboarding')
  redirect(landingPathForRole(session.role))
}
