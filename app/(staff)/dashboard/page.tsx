import type { Metadata } from 'next'
import { OwnerDashboard } from '@/components/dashboard/owner-dashboard'
import { TeamDashboard } from '@/components/dashboard/team-dashboard'
import { getOrgFeatures } from '@/lib/features'
import { canManage, requireStaff } from '@/lib/session'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ portfolio?: string; actions?: string }>
}) {
  const session = await requireStaff()
  const [query, features] = await Promise.all([searchParams, getOrgFeatures(session.organizationId)])

  return canManage(session.role) ? (
    <OwnerDashboard session={session} features={features} query={query} />
  ) : (
    <TeamDashboard session={session} features={features} query={query} />
  )
}
