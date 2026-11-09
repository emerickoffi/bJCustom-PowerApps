import { notFound } from 'next/navigation'
import { canManage, requireStaff } from '@/lib/session'
import { ProjectQuickActionsScope } from '@/components/app/quick-actions'
import { buildProjectQuickActions } from '@/lib/quick-actions'
import { createClient } from '@/lib/supabase/server'
import { getOrgFeatures } from '@/lib/features'
import { getProjectNavItems } from '@/lib/project-nav'
import { ProjectNav } from '@/components/projects/project-nav'
import { AssistantProjectScope } from '@/components/assistant/assistant-context'
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'
import { formatAddress } from '@/lib/format'

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
      .select('id, name, project_number, status, archived_at, address_line1, address_line2, city, state, postal_code')
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
  return (
    <div className="flex flex-col gap-6">
      <ProjectQuickActionsScope projectName={project.name} actions={quickActions} />
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
      <ProjectNav
        userId={session.userId}
        projectId={project.id}
        projectName={project.name}
        projectNumber={project.project_number ?? null}
        status={project.status as ProjectStatus}
        address={formatAddress(project)}
        items={items}
      />
      {children}
    </div>
  )
}
