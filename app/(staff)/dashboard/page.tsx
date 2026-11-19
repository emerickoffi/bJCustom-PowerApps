import type { Metadata } from 'next'
import { OwnerDashboard } from '@/components/dashboard/owner-dashboard'
import { FieldDashboard } from '@/components/dashboard/field-dashboard'
import { getOrgFeatures } from '@/lib/features'
import { requireStaff } from '@/lib/session'
import { dashboardKeyForRole } from '@/lib/dashboard-layout'
import { getGettingStarted } from '@/lib/getting-started'
import { GettingStarted } from '@/components/dashboard/getting-started'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ portfolio?: string; actions?: string; agenda?: string; project?: string; jobs?: string }>
}) {
  const session = await requireStaff()
  const [query, features] = await Promise.all([searchParams, getOrgFeatures(session.organizationId)])
  const key = dashboardKeyForRole(session.role)
  const checklist = session.role === 'org_admin' ? await getGettingStarted(session.organizationId) : null
  const gettingStarted = checklist?.visible ? <GettingStarted checklist={checklist} /> : null

  return (
    <div data-dashboard-theme className="contents">
      {key === 'project_manager' || key === 'builder_staff' ? (
        <FieldDashboard session={session} features={features} dashboardKey={key} projectId={query.project ?? null} />
      ) : (
        <OwnerDashboard session={session} features={features} query={query} gettingStarted={gettingStarted} />
      )}
    </div>
  )
}
