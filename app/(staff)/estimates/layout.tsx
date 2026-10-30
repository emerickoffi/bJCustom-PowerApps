import { requireStaff } from '@/lib/session'
import { requireFeature } from '@/lib/features'

export default async function EstimatesLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaff()
  await requireFeature(session.organizationId, 'estimates')
  return children
}
