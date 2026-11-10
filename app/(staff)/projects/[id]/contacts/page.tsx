import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Users } from 'lucide-react'
import { canManage, requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { loadProjectContacts } from '@/lib/project-contacts-data'
import { loadProjectHomeowners } from '@/lib/project-homeowners-data'
import { loadDirectoryForAssignment } from '@/lib/directory-assignment-data'
import { getClientOptions, getStaffMembers } from '@/lib/queries'
import { getOrgFeatures } from '@/lib/features'
import { directoryClosedReason } from '@/lib/domain'
import { PageHeader, EmptyState } from '@/components/shared/page-header'
import { ProjectContactsTable } from '@/components/projects/project-contacts-table'
import { ProjectClientsPanel } from '@/components/projects/project-people'
import { ProjectTeamPanel } from '@/components/projects/project-team-panel'
import { PeopleAssignWorkspace } from '@/components/projects/people-assign-workspace'
import { AssignSubcontractors } from '@/components/projects/assign-subcontractors'

export const metadata: Metadata = { title: 'People' }

export default async function ProjectPeoplePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ add?: string }>
}) {
  const session = await requireStaff()
  const [{ id }, { add }] = await Promise.all([params, searchParams])
  const supabase = await createClient()
  const manager = canManage(session.role)

  const [{ data: project }, data, homeowners, staff, membersRes, clientOptions, features] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, status, archived_at, project_manager_id')
      .eq('id', id)
      .eq('organization_id', session.organizationId)
      .maybeSingle(),
    loadProjectContacts(supabase, session.organizationId, id),
    loadProjectHomeowners(supabase, session.organizationId, id),
    getStaffMembers(session.organizationId, ['org_admin', 'project_manager', 'builder_staff']),
    supabase.from('project_members').select('id, user_id, project_role').eq('project_id', id).order('created_at'),
    manager ? getClientOptions(session.organizationId) : Promise.resolve(undefined),
    getOrgFeatures(session.organizationId),
  ])
  if (!project) notFound()

  const closedReason = directoryClosedReason(project.status as string, project.archived_at as string | null)
  const canAdd = manager && !closedReason && data.availability !== 'setup-required'
  const directory = canAdd ? await loadDirectoryForAssignment(supabase, session.organizationId, project.id, !!features.subcontractors) : null

  const nameFor = (userId: string | null) => {
    if (!userId) return null
    const m = staff.find((s) => s.user_id === userId)
    return m ? m.full_name || m.email || 'Team member' : 'Former team member'
  }
  const members = (membersRes.data ?? []).map((m) => ({ ...m, name: nameFor(m.user_id) ?? 'Team member' }))

  return (
    <div className="flex flex-col gap-6">
      {directory?.availability === 'ready' && (
        <AssignSubcontractors projectId={project.id} projectName={project.name as string} rows={directory.rows} />
      )}
      <PageHeader
        title="People"
        actions={
          directory?.availability === 'ready' && (
            <PeopleAssignWorkspace projectId={project.id} projectName={project.name as string} rows={directory.rows} defaultOpen={add === '1'} />
          )
        }
      />

      <ProjectClientsPanel projectId={project.id} homeowners={homeowners} canEdit={manager} clientOptions={clientOptions} />

      <ProjectTeamPanel
        projectId={project.id}
        projectName={project.name as string}
        managerId={(project.project_manager_id as string | null) ?? null}
        managerName={nameFor(project.project_manager_id as string | null)}
        members={members}
        staffOptions={staff.map((s) => ({ value: s.user_id, label: s.full_name || s.email || 'Team member' }))}
        canEdit={manager}
      />

      <section aria-labelledby="outside-heading" className="flex flex-col gap-3">
        <h2 id="outside-heading" className="font-serif text-lg font-semibold text-foreground">
          Subcontractors &amp; professionals
        </h2>
        {data.availability === 'setup-required' ? (
          <EmptyState icon={Users} title="Contacts are not set up yet" description="The business contacts directory has not been enabled for this organization." />
        ) : (
          <ProjectContactsTable
            projectId={project.id}
            contacts={data.contacts}
            companies={data.companies}
            assignable={data.assignable}
            canEdit={manager && !project.archived_at}
            closedReason={closedReason}
          />
        )}
      </section>
    </div>
  )
}
