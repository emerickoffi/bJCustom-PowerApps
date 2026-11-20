import type { Metadata } from 'next'
import { FileUp } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { PageContainer, PageHeader } from '@/components/shared/page-header'
import { RecordImportWizard } from '@/components/shared/record-import-wizard'

export const metadata: Metadata = { title: 'Import projects' }

export default async function ImportProjectsPage() {
  await requireManager()
  return (
    <PageContainer width="form">
      <PageHeader icon={FileUp} title="Import projects" backHref="/projects" backLabel="Projects" />
      <RecordImportWizard kind="projects" />
    </PageContainer>
  )
}
