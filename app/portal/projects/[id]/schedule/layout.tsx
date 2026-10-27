import { getSession } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { redirect } from 'next/navigation'

export default async function PortalScheduleLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session?.organizationId) redirect('/portal')
  await requireFeature(session.organizationId, 'schedule', '/portal')
  return children
}
