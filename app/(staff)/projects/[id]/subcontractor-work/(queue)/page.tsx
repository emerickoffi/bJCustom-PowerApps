import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { isSubWorkSetupError } from '@/lib/subcontractor-work'
import { SubWorkShell } from '@/components/subcontractor-work/sub-work-shell'
import { WorkQueue, type QueueRow } from '@/components/subcontractor-work/work-queue'

export const metadata: Metadata = { title: 'Subcontractor work' }

export default async function SubcontractorWorkQueuePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'subcontractors')
  const { id } = await params
  const supabase = await createClient()

  const [{ data: project }, { data: canViewInternal }] = await Promise.all([
    supabase.from('projects').select('id, name').eq('id', id).eq('organization_id', session.organizationId).maybeSingle(),
    supabase.rpc('can_view_project_internal', { p_project: id }),
  ])
  if (!project || !canViewInternal) notFound()

  const { data, error } = await supabase
    .from('subcontractor_work_submissions')
    .select(
      `id, submission_kind, cycle, status, completed_on, submitted_at, reviewed_at,
       company:subcontractor_companies(company_name),
       assignment:schedule_activity_assignments!subcontractor_work_submissions_assignment_id_fkey(activity:schedule_activities(name)),
       issue:project_issues!subcontractor_work_submissions_issue_id_fkey(item_label, category)`,
    )
    .eq('project_id', id)
    .eq('organization_id', session.organizationId)
    .neq('status', 'draft')
    .order('submitted_at', { ascending: false })
    .limit(200)

  return (
    <SubWorkShell projectId={id} active="work">
      <WorkQueue
        projectId={id}
        rows={(data ?? []) as unknown as QueueRow[]}
        failure={error ? (isSubWorkSetupError(error) ? 'setup' : 'query') : null}
      />
    </SubWorkShell>
  )
}
