import type { Metadata } from 'next'
import { HardHat as HardHatIcon } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { ASSIGNABLE_PROJECT_STATUSES } from '@/lib/domain'
import { isAssignmentSetupError, type AssignableProject } from '@/lib/subcontractor-projects'
import { createSubcontractorAction } from '@/app/actions/subcontractors'
import { PageHeader } from '@/components/shared/page-header'
import { SubcontractorForm } from '@/components/subcontractors/subcontractor-form'
import type { ProjectPickerAvailability } from '@/components/subcontractors/project-assignments-picker'

export const metadata: Metadata = { title: 'Add subcontractor' }

export default async function NewSubcontractorPage() {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'subcontractors')

  const supabase = await createClient()
  const [projectsRes, storageProbe] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, project_number, status')
      .eq('organization_id', session.organizationId)
      .in('status', [...ASSIGNABLE_PROJECT_STATUSES])
      .order('project_number')
      .limit(500),
    supabase.from('subcontractor_project_assignments').select('id, ended_at').limit(1),
  ])

  const availability: ProjectPickerAvailability = isAssignmentSetupError(storageProbe.error)
    ? 'setup-required'
    : projectsRes.error || storageProbe.error
      ? 'error'
      : 'ready'

  return (
    <div className="flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        icon={HardHatIcon}
        backHref="/subcontractors"
        backLabel="Subcontractors"
        title="Add subcontractor"
        description="Save a trade partner to your company directory. Only administrators and project managers can see it."
      />
      <SubcontractorForm
        action={createSubcontractorAction}
        cancelHref="/subcontractors"
        projects={(projectsRes.data ?? []) as AssignableProject[]}
        projectAvailability={availability}
      />
    </div>
  )
}
