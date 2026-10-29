import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { FileDiff } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { changeOrdersPath } from '@/lib/change-orders'
import { PageHeader } from '@/components/shared/page-header'
import { ChangeOrderForm } from '@/components/change-orders/change-order-form'

export const metadata: Metadata = { title: 'New change order' }

export default async function NewChangeOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'change_orders')
  const { id } = await params
  const supabase = await createClient()
  const { data: project } = await supabase.from('projects').select('id, name').eq('id', id).maybeSingle()
  if (!project) notFound()
  const back = changeOrdersPath(id)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="New change order" description={project.name} icon={FileDiff} backHref={back} backLabel="Change orders" />
      <ChangeOrderForm
        projectId={id}
        cancelHref={back}
        defaults={{ title: '', description: '', reason: '', requested_by: '', schedule_impact_days: '', price_adjustment: '', lines: [] }}
      />
    </div>
  )
}
