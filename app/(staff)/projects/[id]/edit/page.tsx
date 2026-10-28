import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireManager } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { getClientOptions, getStaffMembers } from '@/lib/queries'
import { signMediaPaths } from '@/lib/media'
import { PageHeader } from '@/components/shared/page-header'
import { ProjectForm } from '@/components/projects/project-form'
import { updateProjectAction } from '@/app/actions/projects'
import { FolderPen as FolderPenIcon } from 'lucide-react'

export const metadata: Metadata = { title: 'Edit project' }

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireManager()
  const { id } = await params
  const supabase = await createClient()
  const { data: project } = await supabase
    .from('projects')
    .select(
      'id, project_number, name, primary_client_id, project_type, description, address_line1, address_line2, city, state, postal_code, lot, block, phase, community, legal_description, estimated_budget_cents, proposed_start_date, target_completion_date, project_manager_id, internal_notes, cover_image_path, cover_image_kind',
    )
    .eq('id', id)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!project) notFound()

  const { cover_image_path: coverPath, cover_image_kind: coverKind, ...defaults } = project
  const [clientOptions, managers, signedCovers] = await Promise.all([
    getClientOptions(session.organizationId),
    getStaffMembers(session.organizationId, ['org_admin', 'project_manager']),
    signMediaPaths(coverPath ? [coverPath] : []),
  ])

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={FolderPenIcon}
        title="Edit project"
      />
      <ProjectForm
        action={updateProjectAction.bind(null, project.id)}
        defaults={defaults}
        cover={{
          orgId: session.organizationId,
          savedUrl: coverPath ? (signedCovers.get(coverPath) ?? null) : null,
          savedKind: coverKind,
        }}
        clientOptions={clientOptions}
        managerOptions={managers.map((m) => ({ value: m.user_id, label: m.full_name || m.email || 'Team member' }))}
        submitLabel="Save changes"
        cancelHref={`/projects/${project.id}`}
      />
    </div>
  )
}
