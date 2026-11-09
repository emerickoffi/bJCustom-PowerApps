import type { Metadata } from 'next'
import { requireManager } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { getUnassignedProjectOptions } from '@/lib/project-client-assignment'
import { loadNewProjectFormData } from '@/lib/project-form-data'
import { createClientAction } from '@/app/actions/clients'
import { PageHeader, pageLayout } from '@/components/shared/page-header'
import { ClientForm } from '@/components/clients/client-form'
import { UserRoundPlus as UserRoundPlusIcon } from 'lucide-react'

export const metadata: Metadata = { title: 'New client' }

export default async function NewClientPage() {
  const session = await requireManager()
  const [features, projectOptions, projectData] = session.organizationId
    ? await Promise.all([
        getOrgFeatures(session.organizationId),
        getUnassignedProjectOptions(await createClient(), session.organizationId),
        loadNewProjectFormData(session.organizationId),
      ])
    : [null, undefined, null]
  return (
    <div className={pageLayout('form')}>
      <PageHeader icon={UserRoundPlusIcon}
        backHref="/clients"
        backLabel="Clients"
        title="Create client"
      />
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
    </div>
  )
}
