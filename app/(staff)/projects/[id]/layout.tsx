import { notFound } from 'next/navigation'
import { canManage, requireStaff } from '@/lib/session'
import { cookies } from 'next/headers'
import { ProjectQuickActionsScope } from '@/components/app/quick-actions'
import { RememberJob } from '@/components/app/job-switcher'
import { buildProjectQuickActions } from '@/lib/quick-actions'
import { CURRENT_JOB_COOKIE, decodeJobCookie } from '@/lib/job-context'
import { createClient } from '@/lib/supabase/server'
import { getOrgFeatures } from '@/lib/features'
import { getProjectNavItems } from '@/lib/project-nav'
import { ProjectNav } from '@/components/projects/project-nav'
import { AssistantProjectScope } from '@/components/assistant/assistant-context'
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const session = await requireStaff()
  const { id } = await params
  const supabase = await createClient()

  const [{ data: project }, { data: canViewInternal }, features] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, project_number, status, archived_at')
      .eq('id', id)
      .eq('organization_id', session.organizationId)
      .maybeSingle(),
    supabase.rpc('can_view_project_internal', { p_project: id }),
    getOrgFeatures(session.organizationId),
  ])
  if (!project) notFound()

  const items = getProjectNavItems(project.id, {
    features,
    projectStatus: project.status,
    canViewInternal: Boolean(canViewInternal),
    canViewFinancials: canManage(session.role),
  })

  // Each action mirrors the guard on its destination page, so only workflows the user can complete are offered.
  const quickActions = buildProjectQuickActions({
    projectId: project.id,
    status: project.status,
    archived: Boolean(project.archived_at),
    role: session.role,
    features,
    canViewInternal: Boolean(canViewInternal),
  })
  const rememberedId = decodeJobCookie((await cookies()).get(CURRENT_JOB_COOKIE)?.value, session.organizationId)

  return (
    <div className="flex flex-col gap-6">
      <ProjectQuickActionsScope projectName={project.name} actions={quickActions} />
      {!project.archived_at && rememberedId !== project.id && <RememberJob projectId={project.id} />}
      <AssistantProjectScope
        project={{
          id: project.id,
          name: project.name,
          number: project.project_number ?? null,
          statusLabel: PROJECT_STATUS_LABELS[project.status as ProjectStatus] ?? project.status,
          capabilities: {
            schedule: Boolean(features.schedule),
            documents: Boolean(features.documents && canViewInternal),
            signatures: Boolean(features.documents && features.e_signatures && canViewInternal),
          },
        }}
      />
      <ProjectNav projectId={project.id} projectName={project.name} projectNumber={project.project_number ?? null} items={items} />
      {children}
    </div>
  )
}
