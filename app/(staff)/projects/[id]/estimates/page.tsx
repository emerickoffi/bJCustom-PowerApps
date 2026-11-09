import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowUpRight } from 'lucide-react'
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
    <div className="flex flex-col gap-4">
      <ProjectEstimatesPanel
        projectId={project.id}
        budgetCents={project.estimated_budget_cents ?? null}
        canManage={canManage(session.role)}
      />
      <Link
        href={`/estimates?project=${encodeURIComponent(project.id)}`}
        className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Filter by status in the Estimates module
        <ArrowUpRight className="size-3.5" aria-hidden="true" />
      </Link>
    </div>
  )
}
