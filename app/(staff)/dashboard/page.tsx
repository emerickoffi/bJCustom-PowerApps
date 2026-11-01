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
  searchParams: Promise<{ portfolio?: string; actions?: string; agenda?: string }>
}) {
  const session = await requireStaff()
  const [query, features] = await Promise.all([searchParams, getOrgFeatures(session.organizationId)])
  const key = dashboardKeyForRole(session.role)

  return (
    <div data-dashboard-theme className="contents">
      {key === 'project_manager' || key === 'builder_staff' ? (
        <FieldDashboard session={session} features={features} dashboardKey={key} />
      ) : (
        <OwnerDashboard session={session} features={features} query={query} />
      )}
    </div>
  )
}
