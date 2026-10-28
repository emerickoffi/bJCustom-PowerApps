import { notFound } from 'next/navigation'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { getOrgFeatures } from '@/lib/features'
import { getProjectNavItems } from '@/lib/project-nav'
import { ProjectNav } from '@/components/projects/project-nav'

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
      .select('id, name, project_number, status')
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
  })

  return (
    <div className="flex flex-col gap-6">
      <ProjectNav projectId={project.id} projectName={project.name} projectNumber={project.project_number ?? null} items={items} />
      {children}
    </div>
  )
}
