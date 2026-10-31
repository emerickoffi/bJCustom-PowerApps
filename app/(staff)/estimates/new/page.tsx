import type { Metadata } from 'next'
import Link from 'next/link'
import { FolderKanban, FilePlus2 as FilePlus2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requireManager } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { createEstimateAction } from '@/app/actions/estimates'
import { loadEstimateProjects } from '@/lib/estimate-form-data'
import { PageHeader, EmptyState } from '@/components/shared/page-header'
import { EstimateForm } from '@/components/estimates/estimate-form'

export const metadata: Metadata = { title: 'Create estimate' }

const ESTIMATE_VALIDITY_DAYS = 30

function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export default async function NewEstimatePage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const session = await requireManager()
  const { project } = await searchParams
  const supabase = await createClient()
  const projects = await loadEstimateProjects(supabase, session.organizationId)
  const preselected = projects.some((p) => p.id === project) ? project : undefined
  const today = new Date().toISOString().slice(0, 10)

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
          defaults={{
            project_id: preselected,
            estimate_date: today,
            expiration_date: addDays(today, ESTIMATE_VALIDITY_DAYS),
          }}
          cancelHref={preselected ? `/projects/${preselected}` : '/estimates'}
          submitLabel="Create estimate"
        />
      )}
    </div>
  )
}
