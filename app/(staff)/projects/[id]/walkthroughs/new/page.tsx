import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireManager } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { WalkthroughBuilder } from '@/components/walkthroughs/walkthrough-builder'
import { ClipboardPlus as ClipboardPlusIcon } from 'lucide-react'

export const metadata: Metadata = { title: 'New walkthrough' }

export default async function NewWalkthroughPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireManager()
  const { id } = await params
  const supabase = await createClient()
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, project_number')
    .eq('id', id)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!project) notFound()

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={ClipboardPlusIcon}
        title="New homeowner walkthrough"
        description="The homeowners linked to this project will complete the checklist from their portal."
      />
      <WalkthroughBuilder projectId={project.id} />
    </div>
  )
}
