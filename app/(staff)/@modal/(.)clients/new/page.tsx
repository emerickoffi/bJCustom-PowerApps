import { requireManager } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { createClientAction } from '@/app/actions/clients'
import { ClientForm } from '@/components/clients/client-form'
import { RouteFormDrawer } from '@/components/shared/route-form-drawer'

export default async function NewClientDrawer() {
  const session = await requireManager()
  const features = session.organizationId ? await getOrgFeatures(session.organizationId) : null
  return (
    <RouteFormDrawer
      kind="client"
      title="Create client"
      description="Add the homeowner's contact details. A client number is assigned automatically when you save."
    >
      <ClientForm
        action={createClientAction}
        submitLabel="Create client"
        pendingLabel="Creating client…"
        cancelHref="/clients"
        additionalContacts={Boolean(features?.additional_contacts)}
      />
    </RouteFormDrawer>
  )
}
