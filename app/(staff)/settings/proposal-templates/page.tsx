import type { Metadata } from 'next'
import { FileText } from 'lucide-react'
import { requireAdmin } from '@/lib/session'
import { PageHeader, pageLayout } from '@/components/shared/page-header'
import { ProposalTemplateManager } from '@/components/proposals/proposal-template-manager'
import { getStarterContent, listProposalTemplates } from '@/lib/proposals-data'

export const metadata: Metadata = { title: 'Proposal templates' }

export default async function ProposalTemplatesPage() {
  const session = await requireAdmin()
  const [templates, starter] = await Promise.all([
    listProposalTemplates(session.organizationId, { all: true }),
    getStarterContent(),
  ])
  return (
    <div className={pageLayout('workspace')}>
      <PageHeader
        icon={FileText}
        title="Proposal templates"
        level={2}
        meta="Reusable introduction, exclusions, payment terms, and contract language for customer proposals."
      />
      <ProposalTemplateManager templates={templates} starter={starter} />
    </div>
  )
}
