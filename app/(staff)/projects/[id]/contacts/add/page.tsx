import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Lock, Users } from 'lucide-react'
import { canManage, requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { getOrgFeatures } from '@/lib/features'
import { projectAcceptsNewAssignments } from '@/lib/domain'
import { loadDirectoryForAssignment } from '@/lib/directory-assignment-data'
import { PageHeader, EmptyState } from '@/components/shared/page-header'
import { DirectoryAssignFlow } from '@/components/projects/directory-assign-flow'

export const metadata: Metadata = { title: 'Add from directory' }

export default async function AddFromDirectoryPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff()
  const { id } = await params
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, status, archived_at')
    .eq('id', id)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!project) notFound()

  const back = (
    <Link
      href={`/projects/${project.id}/contacts`}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Project contacts
    </Link>
  )

  const closed = !!project.archived_at || !projectAcceptsNewAssignments(project.status as string)
  if (!canManage(session.role) || closed) {
    return (
      <div className="flex flex-col gap-6">
        {back}
        <EmptyState
          icon={Lock}
          title={closed ? 'This project is closed to new assignments' : 'You cannot assign contacts'}
          description={
            closed
              ? 'Only projects in preconstruction, construction, or closeout accept new people and companies.'
              : 'Ask an owner or manager to add people and companies to this project.'
          }
        />
      </div>
    )
  }

  const features = await getOrgFeatures(session.organizationId)
  const data = await loadDirectoryForAssignment(supabase, session.organizationId, project.id, !!features.subcontractors)

  return (
    <div className="flex flex-col gap-6">
      {back}
      <PageHeader
        title="Add from directory"
        description={`Select people and companies from your business contacts to add to ${project.name}.`}
      />
      {data.availability === 'setup-required' ? (
        <EmptyState icon={Users} title="Contacts are not set up yet" description="The business contacts directory has not been enabled for this organization." />
      ) : (
        <DirectoryAssignFlow projectId={project.id} projectName={project.name as string} rows={data.rows} />
      )}
    </div>
  )
}
