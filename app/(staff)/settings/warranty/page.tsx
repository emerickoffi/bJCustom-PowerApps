import type { Metadata } from 'next'
import { ShieldCheck } from 'lucide-react'
import { requireAdmin } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { getWarrantyTemplates } from '@/lib/warranty-templates-data'
import { HeaderHelp, PageHeader, pageLayout } from '@/components/shared/page-header'
import { WarrantyTemplateManager } from '@/components/settings/warranty-template-manager'

export const metadata: Metadata = { title: 'Warranty' }

export default async function WarrantySettingsPage() {
  const session = await requireAdmin()
  await requireFeature(session.organizationId, 'warranty')
  const { templates, editable } = await getWarrantyTemplates(session.organizationId)

  return (
    <div className={pageLayout('form', 'max-w-5xl')}>
      <PageHeader
        icon={ShieldCheck}
        title="Warranty"
        titleAddon={
          <HeaderHelp label="About warranties">
            Set how long each part of your warranty lasts and what it covers. Coverages start on the home&apos;s official completion
            date and run at the same time. Homeowners report problems against these coverages in their portal.
          </HeaderHelp>
        }
        level={2}
      />
      <WarrantyTemplateManager templates={templates} editable={editable} />
    </div>
  )
}
