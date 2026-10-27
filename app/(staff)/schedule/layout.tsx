import { requireStaff } from '@/lib/session'
import { requireFeature } from '@/lib/features'

export default async function ScheduleLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaff()
  await requireFeature(session.organizationId, 'schedule')
  return children
}
