import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { FileSpreadsheet } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { PageHeader, Surface, pageLayout } from '@/components/shared/page-header'
import { RequestForm } from '@/components/subcontract-quotes/request-form'
import { emptyRequestDraft, loadRequestFormOptions } from '@/lib/subcontract-quotes-data'

export const metadata: Metadata = { title: 'New quote request' }

export default async function NewQuoteRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'subcontractors')
  const { id } = await params
  const supabase = await createClient()
  const [{ data: project }, { data: canViewInternal }] = await Promise.all([
    supabase.from('projects').select('id, name, currency').eq('id', id).eq('organization_id', session.organizationId).maybeSingle(),
    supabase.rpc('can_view_project_internal', { p_project: id }),
  ])
  if (!project || !canViewInternal) notFound()
  const options = await loadRequestFormOptions(supabase, session.organizationId, id)

  return (
    <div className={pageLayout('form')}>
      <PageHeader icon={FileSpreadsheet} eyebrow={project.name} title="New quote request" />
      <Surface>
        <RequestForm
          projectId={id}
          requestId={null}
          rowVersion={null}
          currency={(project as { currency?: string | null }).currency ?? null}
          companies={options.companies}
          documents={options.documents}
          activities={options.activities}
          initial={emptyRequestDraft()}
        />
      </Surface>
    </div>
  )
}
