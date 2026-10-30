import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Users } from 'lucide-react'
import { canManage, requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { loadProjectContacts } from '@/lib/project-contacts-data'
import { projectAcceptsNewAssignments } from '@/lib/domain'
import { PageHeader, EmptyState } from '@/components/shared/page-header'
import { ProjectContactsTable } from '@/components/projects/project-contacts-table'

export const metadata: Metadata = { title: 'Project contacts' }

export default async function ProjectContactsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff()
  const { id } = await params
  const supabase = await createClient()

  const [{ data: project }, data] = await Promise.all([
    supabase.from('projects').select('id, name, status, archived_at').eq('id', id).eq('organization_id', session.organizationId).maybeSingle(),
    loadProjectContacts(supabase, session.organizationId, id),
  ])
  if (!project) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Project contacts" description="People explicitly assigned to this project from the business contacts directory." />
      {data.availability === 'setup-required' ? (
        <EmptyState icon={Users} title="Contacts are not set up yet" description="The business contacts directory has not been enabled for this organization." />
      ) : (
        <ProjectContactsTable
          projectId={project.id}
          contacts={data.contacts}
          companies={data.companies}
          assignable={data.assignable}
          canEdit={canManage(session.role) && !project.archived_at}
          acceptsAssignments={projectAcceptsNewAssignments(project.status as string)}
        />
      )}
    </div>
  )
}
