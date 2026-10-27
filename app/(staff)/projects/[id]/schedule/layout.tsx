import { requireStaff } from '@/lib/session'
import { requireFeature } from '@/lib/features'

export default async function ProjectScheduleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const session = await requireStaff()
  const { id } = await params
  await requireFeature(session.organizationId, 'schedule', `/projects/${id}`)
  return children
}
