import type { Metadata } from 'next'
import { LayoutDashboard } from 'lucide-react'
import { PageHeader, pageLayout } from '@/components/shared/page-header'
import { DashboardVisibilityForm } from '@/components/settings/dashboard-visibility-form'
import { getDashboardVisibility } from '@/lib/dashboard-visibility-data'
import { requireAdmin } from '@/lib/session'

export const metadata: Metadata = { title: 'Dashboard settings' }

export default async function DashboardSettingsPage() {
  const session = await requireAdmin()
  const { settings, customized, error } = await getDashboardVisibility(session.organizationId)

  return (
    <div className={pageLayout('form')}>
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        description="Choose which summary cards and sections appear on the Command Center for your company, and where they sit. Hiding or moving something here only changes the dashboard. The module, its records, and everyone's permissions stay exactly as they are."
        backHref="/settings"
        backLabel="Company settings"
      />
      <DashboardVisibilityForm initial={settings} customized={customized} loadError={error} />
    </div>
  )
}
