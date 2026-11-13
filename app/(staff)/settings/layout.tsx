import { Settings as SettingsIcon } from 'lucide-react'
import { requireAdmin } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { buildSettingsNav } from '@/lib/settings-nav'
import { PageHeader, pageLayout } from '@/components/shared/page-header'
import { SettingsNav } from '@/components/settings/settings-nav'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin()
  const features = await getOrgFeatures(session.organizationId)

  return (
    <div className={pageLayout('workspace')}>
      <PageHeader icon={SettingsIcon} title="Company settings" />
      <SettingsNav items={buildSettingsNav(features)} />
      <div className="flex min-w-0 flex-col">{children}</div>
    </div>
  )
}
