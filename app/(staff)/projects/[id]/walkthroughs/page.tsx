import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ClipboardCheck, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
        title="Walkthroughs"
        icon={ClipboardCheck}
        actions={
          canManage(session.role) ? (
            <Button render={<Link href={`/projects/${project.id}/walkthroughs/new`} />} nativeButton={false}>
              <Plus data-icon="inline-start" />
              New walkthrough
            </Button>
          ) : undefined
        }
      />
      <ProjectWalkthroughsPanel projectId={project.id} />
    </div>
  )
}
