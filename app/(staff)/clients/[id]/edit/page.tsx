import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireManager } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { updateClientAction } from '@/app/actions/clients'
import { PageHeader } from '@/components/shared/page-header'
import { ClientForm } from '@/components/clients/client-form'
import { UserRoundPen as UserRoundPenIcon } from 'lucide-react'

export const metadata: Metadata = { title: 'Edit client' }

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireManager()
  const { id } = await params
  const supabase = await createClient()
  const { data: client } = await supabase
    .from('clients')
    .select(
      'id, client_number, first_name, middle_name, last_name, company_name, email, phone, alternate_phone, address_line1, address_line2, city, state, postal_code, country, preferred_communication, status, notes',
    )
    .eq('id', id)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!client) notFound()

  return (
    <div className="flex max-w-5xl flex-col gap-8">
      <PageHeader icon={UserRoundPenIcon}
        backHref={`/clients/${client.id}`}
        backLabel="Client"
        eyebrow={`Client #${client.client_number}`}
        title={`Edit ${client.first_name} ${client.last_name}`}
      />
      <ClientForm
        action={updateClientAction.bind(null, client.id)}
        defaults={client}
        submitLabel="Save changes"
        cancelHref={`/clients/${client.id}`}
      />
    </div>
  )
}
