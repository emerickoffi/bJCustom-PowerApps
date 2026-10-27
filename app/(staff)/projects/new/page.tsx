import type { Metadata } from 'next'
import { requireManager } from '@/lib/session'
import { getClientOptions, getStaffMembers } from '@/lib/queries'
import { PageHeader } from '@/components/shared/page-header'
import { ProjectForm } from '@/components/projects/project-form'
import { createProjectAction } from '@/app/actions/projects'
import { FolderPlus as FolderPlusIcon } from 'lucide-react'

export const metadata: Metadata = { title: 'New project' }

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const session = await requireManager()
  const { client } = await searchParams
  const [clientOptions, managers] = await Promise.all([
    getClientOptions(session.organizationId),
    getStaffMembers(session.organizationId, ['org_admin', 'project_manager']),
  ])
  const preselected = clientOptions.some((o) => o.value === client) ? client : undefined

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={FolderPlusIcon}
        backHref="/projects"
        backLabel="Projects"
        title="New project"
        description="A project number is assigned automatically when you save."
      />
      <ProjectForm
        action={createProjectAction}
        defaults={{ primary_client_id: preselected }}
        clientOptions={clientOptions}
        managerOptions={managers.map((m) => ({ value: m.user_id, label: m.full_name || m.email || 'Team member' }))}
        submitLabel="Create project"
        cancelHref="/projects"
      />
    </div>
  )
}
