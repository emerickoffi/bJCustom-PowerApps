import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { HardHat as HardHatIcon } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { projectAcceptsNewAssignments } from '@/lib/domain'
import { isUuid, splitProjectAssignments } from '@/lib/subcontractor-projects'
import {
  loadActiveWorkByProject,
  loadAssignableProjects,
  loadProjectAssignments,
  loadSubcontractor,
} from '@/lib/subcontractor-detail-data'
import { updateSubcontractorAction } from '@/app/actions/subcontractors'
import { PageHeader } from '@/components/shared/page-header'
import { SubcontractorForm } from '@/components/subcontractors/subcontractor-form'
import type { ProjectPickerAvailability } from '@/components/subcontractors/project-assignments-picker'

export const metadata: Metadata = { title: 'Edit subcontractor' }

export default async function EditSubcontractorPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'subcontractors')
  const { id } = await params
  if (!isUuid(id)) notFound()

  const supabase = await createClient()
  const company = await loadSubcontractor(supabase, session.organizationId, id)
  if (!company) notFound()
  const [associated, assignable, activeWork] = await Promise.all([
    loadProjectAssignments(supabase, session.organizationId, id),
    loadAssignableProjects(supabase, session.organizationId),
    loadActiveWorkByProject(supabase, session.organizationId, id),
  ])
  const { current, history } = splitProjectAssignments(associated.records, projectAcceptsNewAssignments)
  const currentIds = new Set(current.map((r) => r.project.id))
  const availability: ProjectPickerAvailability =
    associated.availability !== 'ready' ? associated.availability : assignable.error ? 'error' : 'ready'

  return (
    <div className="flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        icon={HardHatIcon}
        backHref={`/subcontractors/${company.id}`}
        backLabel={company.company_name}
        title={`Edit ${company.company_name}`}
        description="Update company details and manage project assignments. Previous assignments are preserved for reference."
      />
      <SubcontractorForm
        action={updateSubcontractorAction.bind(null, company.id)}
        cancelHref={`/subcontractors/${company.id}`}
        company={company}
        projects={assignable.projects.filter((p) => !currentIds.has(p.id))}
        existingAssignments={{ companyId: company.id, current, history, activeWork }}
        projectAvailability={availability}
      />
    </div>
  )
}
