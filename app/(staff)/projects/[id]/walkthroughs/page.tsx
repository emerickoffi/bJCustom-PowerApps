import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ClipboardCheck } from 'lucide-react'
import { requireStaff, canManage } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { ProjectWalkthroughsPanel } from '@/components/walkthroughs/project-walkthroughs-panel'

export const metadata: Metadata = { title: 'Walkthroughs' }

export default async function ProjectWalkthroughsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff()
  const { id } = await params
  const supabase = await createClient()
  const { data: project } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', id)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!project) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        tone="section"
        title="Walkthroughs"
        description={`Walkthroughs, punch lists and open issues for ${project.name}.`}
        icon={ClipboardCheck}
      />
      <ProjectWalkthroughsPanel projectId={project.id} canCreate={canManage(session.role)} />
    </div>
  )
}
