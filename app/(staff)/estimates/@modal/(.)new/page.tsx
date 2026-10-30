import Link from 'next/link'
import { FolderKanban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requireManager } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { createEstimateAction } from '@/app/actions/estimates'
import { loadEstimateProjects } from '@/lib/estimate-form-data'
import { EmptyState } from '@/components/shared/page-header'
import { EstimateForm } from '@/components/estimates/estimate-form'
import { OverlayBody } from '@/components/shared/form-overlay'
import { RouteFormDrawer } from '@/components/shared/route-form-drawer'

export default async function NewEstimateDrawer({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const session = await requireManager()
  const { project } = await searchParams
  const supabase = await createClient()
  const projects = await loadEstimateProjects(supabase, session.organizationId)
  const preselected = projects.some((p) => p.id === project) ? project : undefined

  return (
    <RouteFormDrawer
      kind="estimate"
      title="Create estimate"
      description="Set up the estimate for an existing project. You will add cost line items on the next screen."
    >
      {projects.length === 0 ? (
        <OverlayBody className="py-6">
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
        </OverlayBody>
      ) : (
        <EstimateForm
          action={createEstimateAction}
          projects={projects}
          defaults={{ project_id: preselected, estimate_date: new Date().toISOString().slice(0, 10) }}
          cancelHref={preselected ? `/projects/${preselected}` : '/estimates'}
          submitLabel="Create estimate"
        />
      )}
    </RouteFormDrawer>
  )
}
