import type { Metadata } from 'next'
import { requireManager } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { getClientOptions, getStaffMembers } from '@/lib/queries'
import { getOrgFeatures } from '@/lib/features'
import { PageHeader } from '@/components/shared/page-header'
import { ProjectForm, type ClientMailingAddress } from '@/components/projects/project-form'
import { createProjectAction } from '@/app/actions/projects'
import { FolderPlus as FolderPlusIcon } from 'lucide-react'

export const metadata: Metadata = { title: 'New project' }

async function getClientMailingAddresses(organizationId: string): Promise<Record<string, ClientMailingAddress>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('clients')
    .select('id, address_line1, address_line2, city, state, postal_code')
    .eq('organization_id', organizationId)
  const addresses: Record<string, ClientMailingAddress> = {}
  for (const row of data ?? []) {
    if (!row.address_line1) continue
    addresses[row.id] = {
      address_line1: row.address_line1 ?? '',
      address_line2: row.address_line2 ?? '',
      city: row.city ?? '',
      state: row.state ?? '',
      postal_code: row.postal_code ?? '',
    }
  }
  return addresses
}

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const session = await requireManager()
  const { client } = await searchParams
  const [clientOptions, managers, features, clientAddresses] = await Promise.all([
    getClientOptions(session.organizationId),
    getStaffMembers(session.organizationId, ['org_admin', 'project_manager']),
    getOrgFeatures(session.organizationId),
    getClientMailingAddresses(session.organizationId),
  ])
  const preselected = clientOptions.some((o) => o.value === client) ? client : undefined

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={FolderPlusIcon}
        backHref="/projects"
        backLabel="Projects"
        title="New project"
        description="A project number is assigned automatically when you save."
      />
      <ProjectForm
        action={createProjectAction}
        defaults={{ primary_client_id: preselected }}
        clientAddresses={clientAddresses}
        clientOptions={clientOptions}
        managerOptions={managers.map((m) => ({ value: m.user_id, label: m.full_name || m.email || 'Team member' }))}
        scheduleSetup={features.schedule}
        cover={{ orgId: session.organizationId }}
        submitLabel="Create project"
        pendingLabel="Creating project…"
        cancelHref="/projects"
      />
    </div>
  )
}
