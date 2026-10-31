import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { FileDiff } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { loadChangeOrder } from '@/lib/change-orders-data'
import { changeOrderPath, isEditableStatus } from '@/lib/change-orders'
import { centsToSignedInput } from '@/lib/financials'
import { PageHeader, Surface } from '@/components/shared/page-header'
import { ChangeOrderStatusBadge } from '@/components/change-orders/change-order-status-badge'
import { ChangeOrderStepper } from '@/components/change-orders/change-order-stepper'
import { ChangeOrderForm } from '@/components/change-orders/change-order-form'

export const metadata: Metadata = { title: 'Edit change order' }

export default async function EditChangeOrderPage({ params }: { params: Promise<{ id: string; coId: string }> }) {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'change_orders')
  const { id, coId } = await params
  const data = await loadChangeOrder(id, coId)
  if (!data) notFound()
  const { co, lines } = data
  const detail = changeOrderPath(id, coId)
  if (!isEditableStatus(co.status)) redirect(detail)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        tone="plain"
        title={`Edit ${co.co_number}`}
        description={co.title}
        titleAddon={<ChangeOrderStatusBadge status={co.status} />}
        icon={FileDiff}
        backHref={detail}
        backLabel={co.co_number}
      />
      <Surface aria-label="Workflow progress" className="py-5 md:py-5">
        <ChangeOrderStepper status={co.status} />
      </Surface>
      <ChangeOrderForm
        projectId={id}
        cancelHref={detail}
        status={co.status}
        defaults={{
          id: co.id,
          title: co.title,
          description: co.description ?? '',
          reason: co.reason ?? '',
          requested_by: co.requested_by ?? '',
          schedule_impact_days: co.schedule_impact_days === null ? '' : String(co.schedule_impact_days),
          price_adjustment: co.price_adjustment_cents === 0 ? '' : centsToSignedInput(co.price_adjustment_cents),
          lines: lines.map((l) => ({
            category: l.category,
            description: l.description,
            quantity: String(l.quantity),
            unit: l.unit,
            unit_cost: centsToSignedInput(l.unit_cost_cents),
          })),
        }}
      />
    </div>
  )
}
