import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireManager } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { PageHeader, pageLayout } from '@/components/shared/page-header'
import { WalkthroughBuilder } from '@/components/walkthroughs/walkthrough-builder'
import { ClipboardPlus as ClipboardPlusIcon } from 'lucide-react'

export const metadata: Metadata = { title: 'Create walkthrough' }

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
    <div className={pageLayout('form', 'mx-auto max-w-5xl')}>
      <PageHeader icon={ClipboardPlusIcon}
        backHref={`/projects/${project.id}`}
        backLabel={project.name}
        eyebrow={<span className="font-mono normal-case tracking-normal">{project.project_number}</span>}
        title="Create walkthrough"
        meta={<span className="text-sm text-muted-foreground">{project.name}</span>}
      />
      <WalkthroughBuilder projectId={project.id} />
    </div>
  )
}
