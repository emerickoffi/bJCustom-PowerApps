import type { Metadata } from 'next'
import { LayoutDashboard } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { DashboardVisibilityForm } from '@/components/settings/dashboard-visibility-form'
import { getDashboardVisibility } from '@/lib/dashboard-visibility-data'
import { requireAdmin } from '@/lib/session'

export const metadata: Metadata = { title: 'Dashboard settings' }

export default async function DashboardSettingsPage() {
  const session = await requireAdmin()
  const { settings, customized, error } = await getDashboardVisibility(session.organizationId)

  return (
    <div className="flex max-w-5xl flex-col gap-8">
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        description="Choose which summary cards and sections appear on the Command Center for your company. Hiding something here only changes the dashboard. The module, its records, and everyone's permissions stay exactly as they are."
        backHref="/settings"
        backLabel="Company settings"
      />
      <DashboardVisibilityForm initial={settings} customized={customized} loadError={error} />
    </div>
  )
}
