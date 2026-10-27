import { requireStaff } from '@/lib/session'
import { requireAnyFeature } from '@/lib/features'

// Warranty claims reuse issue pages, so they stay reachable under Warranty; the database hides
// punch list items that are not linked to a claim while Issues is off.
export default async function ProjectIssuesLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const session = await requireStaff()
  const { id } = await params
  await requireAnyFeature(session.organizationId, ['issues', 'warranty'], `/projects/${id}`)
  return children
}
