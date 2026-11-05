import { requireManager } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { getUnassignedProjectOptions } from '@/lib/project-client-assignment'
import { loadNewProjectFormData } from '@/lib/project-form-data'
import { createClientAction } from '@/app/actions/clients'
import { ClientForm } from '@/components/clients/client-form'
import { RouteFormDrawer } from '@/components/shared/route-form-drawer'

export default async function NewClientDrawer() {
  const session = await requireManager()
  const [features, projectOptions, projectData] = session.organizationId
    ? await Promise.all([
        getOrgFeatures(session.organizationId),
        getUnassignedProjectOptions(await createClient(), session.organizationId),
        loadNewProjectFormData(session.organizationId),
      ])
    : [null, undefined, null]
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
        projectOptions={projectOptions}
        projectSetup={
          projectData && session.organizationId ? { orgId: session.organizationId, ...projectData } : undefined
        }
      />
    </RouteFormDrawer>
  )
}
