import type { Metadata } from 'next'
import { requireManager } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { createClientAction } from '@/app/actions/clients'
import { PageHeader } from '@/components/shared/page-header'
import { ClientForm } from '@/components/clients/client-form'
import { UserRoundPlus as UserRoundPlusIcon } from 'lucide-react'

export const metadata: Metadata = { title: 'New client' }

export default async function NewClientPage() {
  const session = await requireManager()
  const features = session.organizationId ? await getOrgFeatures(session.organizationId) : null
  return (
    <div className="flex w-full max-w-4xl flex-col gap-6">
      <PageHeader icon={UserRoundPlusIcon}
        tone="sage"
        backHref="/clients"
        backLabel="Clients"
        title="Create client"
        description="Add the homeowner's contact details and mailing address. A client number is assigned automatically when you save."
      />
      <ClientForm
        action={createClientAction}
        submitLabel="Create client"
        pendingLabel="Creating client…"
        cancelHref="/clients"
        additionalContacts={Boolean(features?.additional_contacts)}
      />
    </div>
  )
}
