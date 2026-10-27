import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { requireManager } from '@/lib/session'
import { clientDisplayName, getEstimate, getEstimateFamily } from '@/lib/estimate-queries'
import { updateEstimateAction } from '@/app/actions/estimates'
import { centsToInput, isEditableStatus } from '@/lib/estimates'
import { PageHeader } from '@/components/shared/page-header'
import { EstimateForm } from '@/components/estimates/estimate-form'
import { FilePen as FilePenIcon } from 'lucide-react'

export const metadata: Metadata = { title: 'Edit estimate' }

export default async function EditEstimatePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireManager()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const estimate = await getEstimate(id, session.organizationId)
  if (!estimate) notFound()
  const family = await getEstimateFamily(estimate.family_id)
  if (!isEditableStatus(estimate.status) || family[0]?.id !== estimate.id) redirect(`/estimates/${id}`)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={FilePenIcon}
        backHref={`/estimates/${id}`}
        backLabel="Estimate"
        title={`Edit ${estimate.estimate_number} · Rev ${estimate.revision}`}
        description={`${estimate.project?.name ?? 'Project'}${clientDisplayName(estimate.client) ? ` · ${clientDisplayName(estimate.client)}` : ''}`}
      />
      <EstimateForm
        action={updateEstimateAction.bind(null, id)}
        estimateNumber={`${estimate.estimate_number} (Rev ${estimate.revision})`}
        defaults={{
          project_id: estimate.project_id,
          name: estimate.name,
          description: estimate.description,
          estimate_date: estimate.estimate_date,
          expiration_date: estimate.expiration_date,
          markup_percent: String(Number(estimate.markup_percent)),
          contingency_percent: String(Number(estimate.contingency_percent)),
          land_cost: centsToInput(estimate.land_cost_cents),
          notes: estimate.notes,
          is_demo: estimate.is_demo,
        }}
        cancelHref={`/estimates/${id}`}
        submitLabel="Save estimate"
      />
    </div>
  )
}
