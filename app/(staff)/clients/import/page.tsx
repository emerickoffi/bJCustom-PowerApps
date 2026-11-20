import type { Metadata } from 'next'
import { FileUp } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { PageContainer, PageHeader } from '@/components/shared/page-header'
import { RecordImportWizard } from '@/components/shared/record-import-wizard'

export const metadata: Metadata = { title: 'Import clients' }

export default async function ImportClientsPage() {
  await requireManager()
  return (
    <PageContainer width="form">
      <PageHeader icon={FileUp} title="Import clients" backHref="/clients" backLabel="Clients" />
      <RecordImportWizard kind="clients" />
    </PageContainer>
  )
}
