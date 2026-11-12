import type { Metadata } from 'next'
import { ListChecks } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { getSelectionCategories } from '@/lib/selections-data'
import { selectionsPath } from '@/lib/selections'
import { PageHeader, Surface } from '@/components/shared/page-header'
import { SelectionForm } from '@/components/selections/selection-form'

export const metadata: Metadata = { title: 'New selection' }

export default async function NewSelectionPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'estimates')
  const { id } = await params
  const categories = await getSelectionCategories()

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="New selection" icon={ListChecks} backHref={selectionsPath(id)} backLabel="Selections" />
      <Surface>
        <SelectionForm projectId={id} categories={categories} />
      </Surface>
    </div>
  )
}
