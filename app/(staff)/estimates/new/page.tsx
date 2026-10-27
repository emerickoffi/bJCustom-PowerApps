import type { Metadata } from 'next'
import Link from 'next/link'
import { FolderKanban, FilePlus2 as FilePlus2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requireManager } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { createEstimateAction } from '@/app/actions/estimates'
import { PageHeader, EmptyState } from '@/components/shared/page-header'
import { EstimateForm, type EstimateProjectOption } from '@/components/estimates/estimate-form'

export const metadata: Metadata = { title: 'Create estimate' }

type ClientRef = { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null

export default async function NewEstimatePage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const session = await requireManager()
  const { project } = await searchParams
  const supabase = await createClient()
  const { data } = await supabase
    .from('projects')
    .select('id, name, project_number, client:clients!projects_primary_client_id_fkey(first_name, last_name)')
    .eq('organization_id', session.organizationId)
    .not('status', 'eq', 'cancelled')
    .order('name')

  const projects: EstimateProjectOption[] = (data ?? []).map((p) => {
    const c = Array.isArray(p.client) ? p.client[0] : (p.client as ClientRef)
    const client = Array.isArray(c) ? c[0] : c
    return {
      id: p.id,
      label: `${p.name} (${p.project_number})`,
      clientName: client ? `${client.first_name} ${client.last_name}` : null,
    }
  })
  const preselected = projects.some((p) => p.id === project) ? project : undefined

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={FilePlus2Icon}
        backHref={preselected ? `/projects/${preselected}` : '/estimates'}
        backLabel={preselected ? 'Project' : 'Estimates'}
        title="Create estimate"
        description="Set up the estimate for an existing project. You will add cost line items on the next screen."
      />
      {projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="Create a project first"
          description="Estimates belong to an existing project and its client. Add a project, then come back to estimate it."
          action={
            <Button render={<Link href="/projects/new" />} nativeButton={false}>
              New project
            </Button>
          }
        />
      ) : (
        <EstimateForm
          action={createEstimateAction}
          projects={projects}
          defaults={{ project_id: preselected, estimate_date: new Date().toISOString().slice(0, 10) }}
          cancelHref={preselected ? `/projects/${preselected}` : '/estimates'}
          submitLabel="Create estimate"
        />
      )}
    </div>
  )
}
