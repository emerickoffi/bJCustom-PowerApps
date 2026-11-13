import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Tags } from 'lucide-react'
import { requireAdmin } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { getSelectionCategoryRecords } from '@/lib/selections-data'
import { HeaderHelp, PageHeader, pageLayout } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { SelectionCategoryManager } from '@/components/settings/selection-category-manager'

export const metadata: Metadata = { title: 'Selection categories' }

export default async function SelectionCategoriesPage() {
  const session = await requireAdmin()
  await requireFeature(session.organizationId, 'estimates')
  const { records, manageable } = await getSelectionCategoryRecords()

  return (
    <div className={pageLayout('form')}>
      <PageHeader
        icon={Tags}
        title="Selection categories"
        titleAddon={
          <HeaderHelp label="About selection categories">
            These categories appear in the Category dropdown on every project&apos;s selections. Renaming or deactivating a
            category never changes selections that already use it.
          </HeaderHelp>
        }
        actions={
          <Button
            variant="outline"
            className="border-[#D6E0D5] bg-white text-primary hover:bg-[#F3F4F6] hover:text-brand-deep"
            render={<Link href="/settings" />}
            nativeButton={false}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Company settings
          </Button>
        }
      />
      <SelectionCategoryManager records={records} manageable={manageable} />
    </div>
  )
}
