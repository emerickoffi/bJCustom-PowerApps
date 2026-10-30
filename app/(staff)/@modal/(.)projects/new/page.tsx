import { requireManager } from '@/lib/session'
import { loadNewProjectFormData } from '@/lib/project-form-data'
import { ProjectForm } from '@/components/projects/project-form'
import { createProjectAction } from '@/app/actions/projects'
import { RouteFormDrawer } from '@/components/shared/route-form-drawer'

export default async function NewProjectDrawer({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const session = await requireManager()
  const { client } = await searchParams
  const data = await loadNewProjectFormData(session.organizationId, client)

  return (
    <RouteFormDrawer
      kind="project"
      size="xl"
      title="New project"
      description="A project number is assigned automatically when you save."
    >
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
        cancelHref={data.preselected ? `/clients/${data.preselected}` : '/projects'}
      />
    </RouteFormDrawer>
  )
}
