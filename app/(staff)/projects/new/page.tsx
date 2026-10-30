import type { Metadata } from 'next'
import { FolderPlus as FolderPlusIcon } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { loadNewProjectFormData } from '@/lib/project-form-data'
import { PageHeader } from '@/components/shared/page-header'
import { ProjectForm } from '@/components/projects/project-form'
import { createProjectAction } from '@/app/actions/projects'

export const metadata: Metadata = { title: 'New project' }

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const session = await requireManager()
  const { client } = await searchParams
  const data = await loadNewProjectFormData(session.organizationId, client)

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
        defaults={{ primary_client_id: data.preselected }}
        clientAddresses={data.clientAddresses}
        clientOptions={data.clientOptions}
        managerOptions={data.managerOptions}
        scheduleSetup={data.scheduleSetup}
        cover={{ orgId: session.organizationId }}
        submitLabel="Create project"
        pendingLabel="Creating project…"
        cancelHref="/projects"
      />
    </div>
  )
}
