import type { Metadata } from 'next'
import { OwnerDashboard } from '@/components/dashboard/owner-dashboard'
import { FieldDashboard } from '@/components/dashboard/field-dashboard'
import { getOrgFeatures } from '@/lib/features'
import { requireStaff } from '@/lib/session'
import { dashboardKeyForRole } from '@/lib/dashboard-layout'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ portfolio?: string; actions?: string }>
}) {
  const session = await requireStaff()
  const [query, features] = await Promise.all([searchParams, getOrgFeatures(session.organizationId)])
  const key = dashboardKeyForRole(session.role)

  if (key === 'project_manager' || key === 'builder_staff') {
    return <FieldDashboard session={session} features={features} dashboardKey={key} />
  }
  return <OwnerDashboard session={session} features={features} query={query} />
}
