import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireStaff, canManage } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { ProjectEstimatesPanel } from '@/components/estimates/project-estimates-panel'

export const metadata: Metadata = { title: 'Project estimates' }

export default async function ProjectEstimatesPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff()
  await requireFeature(session.organizationId, 'estimates')
  const { id } = await params
  const supabase = await createClient()
  const { data: project } = await supabase
    .from('projects')
    .select('id, estimated_budget_cents')
    .eq('id', id)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!project) notFound()

  return (
    <ProjectEstimatesPanel
      projectId={project.id}
      budgetCents={project.estimated_budget_cents ?? null}
      canManage={canManage(session.role)}
    />
  )
}
