import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { FileText } from 'lucide-react'
import { canManage, requireStaff } from '@/lib/session'
import { clientDisplayName, getEstimate, getEstimateFamily } from '@/lib/estimate-queries'
import { isEditableStatus } from '@/lib/estimates'
import { formatAddress, formatDate } from '@/lib/format'
import { getProposalPreview, listProposalTemplates } from '@/lib/proposals-data'
import { PageHeader, pageLayout } from '@/components/shared/page-header'
import { ProposalEditor } from '@/components/proposals/proposal-editor'

export const metadata: Metadata = { title: 'Proposal' }

export default async function EstimateProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const estimate = await getEstimate(id, session.organizationId)
  if (!estimate?.project) notFound()
  const [preview, family, templates] = await Promise.all([
    getProposalPreview(id),
    getEstimateFamily(estimate.family_id),
    listProposalTemplates(session.organizationId),
  ])
  if (!preview) notFound()

  const manager = canManage(session.role)
  const isLatest = family[0]?.id === estimate.id
  const editable = manager && isLatest && isEditableStatus(estimate.status)
  const lockedReason = !manager
    ? 'Only managers can edit proposals.'
    : !isLatest
      ? 'A newer revision of this estimate exists. Edit the proposal on the latest revision.'
      : !isEditableStatus(estimate.status)
        ? 'This proposal is locked because it was sent to the homeowner. Create a revision of the estimate to change it.'
        : null

  const brand = session.brand
  const orEmpty = (v: string) => (v === '—' ? '' : v)
  const companyAddress = orEmpty(formatAddress({ address_line1: brand.addressLine1, city: brand.city, state: brand.state, postal_code: brand.postalCode }))
  const contact = [brand.phone, brand.email, brand.website].filter(Boolean).join(' · ')

  return (
    <div className={pageLayout('workspace')}>
      <PageHeader
        icon={FileText}
        title="Proposal"
        backHref={`/estimates/${id}`}
        backLabel="Back to estimate"
        meta={`${estimate.estimate_number} · Rev ${estimate.revision} · ${estimate.project.name}`}
      />
      <ProposalEditor
        estimateId={id}
        initial={preview.proposal}
        pricing={preview.pricing}
        scope={estimate.description}
        templates={templates}
        editable={editable}
        lockedReason={lockedReason}
        pdfHref={`/api/estimates/${id}/proposal-pdf`}
        canManageTemplates={session.role === 'org_admin'}
        header={{
          companyName: brand.legalName || brand.displayName,
          companyLines: [companyAddress, contact].filter(Boolean),
          number: `${estimate.estimate_number} Rev ${estimate.revision}`,
          date: formatDate(estimate.estimate_date),
          validUntil: estimate.expiration_date ? formatDate(estimate.expiration_date) : null,
          projectName: estimate.project.name,
          projectAddress: orEmpty(formatAddress(estimate.project)) || null,
          preparedFor: clientDisplayName(estimate.client) ?? null,
        }}
      />
    </div>
  )
}
