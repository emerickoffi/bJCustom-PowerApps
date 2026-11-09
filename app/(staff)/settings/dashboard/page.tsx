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
        backHref="/settings"
        backLabel="Company settings"
      />
      <DashboardVisibilityForm initial={settings} customized={customized} loadError={error} />
    </div>
  )
}
