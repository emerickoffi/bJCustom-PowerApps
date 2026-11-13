import type { Metadata } from 'next'
import { Tags } from 'lucide-react'
import { requireAdmin } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { getSelectionCategoryRecords } from '@/lib/selections-data'
import { HeaderHelp, PageHeader, pageLayout } from '@/components/shared/page-header'
import { SelectionCategoryManager } from '@/components/settings/selection-category-manager'

export const metadata: Metadata = { title: 'Selection categories' }

export default async function SelectionCategoriesPage() {
  const session = await requireAdmin()
  await requireFeature(session.organizationId, 'estimates')
  const { records, manageable } = await getSelectionCategoryRecords()

  return (
    <div className={pageLayout('form', 'max-w-5xl')}>
      <PageHeader
        icon={Tags}
        title="Selection categories"
        titleAddon={
          <HeaderHelp label="About selection categories">
            These categories appear in the Category dropdown on every project&apos;s selections. Renaming or deactivating a
            category never changes selections that already use it.
          </HeaderHelp>
        }
        level={2}
      />
      <SelectionCategoryManager records={records} manageable={manageable} />
    </div>
  )
}
