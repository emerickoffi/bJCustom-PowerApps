import { canManage, requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { getOrgFeatures } from '@/lib/features'
import { directoryClosedReason } from '@/lib/domain'
import { loadDirectoryForAssignment } from '@/lib/directory-assignment-data'
import { AssignSubcontractors } from '@/components/projects/assign-subcontractors'

/** Adds the floating "Assign subcontractors" action to every Sub work section, under the Overview's rules. */
export default async function SubcontractorWorkLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const session = await requireStaff()
  if (!canManage(session.role)) return children

  const { id } = await params
  const supabase = await createClient()
  const [{ data: project }, features] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, status, archived_at')
      .eq('id', id)
      .eq('organization_id', session.organizationId)
      .maybeSingle(),
    getOrgFeatures(session.organizationId),
  ])
  if (!project || !features.subcontractors) return children
  if (directoryClosedReason(project.status as string, project.archived_at as string | null)) return children

  const directory = await loadDirectoryForAssignment(supabase, session.organizationId, project.id, true)
  if (directory.availability !== 'ready') return children

  return (
    <AssignSubcontractors projectId={project.id} projectName={project.name as string} rows={directory.rows}>
      {children}
    </AssignSubcontractors>
  )
}
