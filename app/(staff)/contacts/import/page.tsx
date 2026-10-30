import type { Metadata } from 'next'
import { FileUp } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { PageContainer, PageHeader } from '@/components/shared/page-header'
import { ImportWizard } from '@/components/contacts/import-wizard'

export const metadata: Metadata = { title: 'Import contacts' }

export default async function ImportContactsPage() {
  await requireManager()
  return (
    <PageContainer width="narrow">
      <PageHeader
        icon={FileUp}
        title="Import contacts"
        description="Upload a CSV, map its columns, review every row, then import. Nothing is saved until you confirm."
        backHref="/contacts?view=people"
        backLabel="Contacts"
      />
      <ImportWizard />
    </PageContainer>
  )
}
