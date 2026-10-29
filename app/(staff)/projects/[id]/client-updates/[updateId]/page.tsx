import type { Metadata } from 'next'
import { Megaphone } from 'lucide-react'
import { requireClientUpdateProject, getClientUpdate, getClientUpdateCandidates } from '@/lib/client-updates-data'
import { clientUpdatesPath } from '@/lib/client-updates'
import { PageHeader } from '@/components/shared/page-header'
import { ClientUpdateStateBadge } from '@/components/client-updates/client-update-state-badge'
import { ClientUpdateComposer } from '@/components/client-updates/client-update-composer'

export const metadata: Metadata = { title: 'Client update' }

export default async function ClientUpdateEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; updateId: string }>
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const { id, updateId } = await params
  const sp = await searchParams
  const { project, canEdit, aiAvailable } = await requireClientUpdateProject(id)
  const { update, sources, photos } = await getClientUpdate(project.id, updateId)

  const iso = /^\d{4}-\d{2}-\d{2}$/
  const start = sp.from && iso.test(sp.from) ? sp.from : update.period_start
  const end = sp.to && iso.test(sp.to) && sp.to >= start ? sp.to : update.period_end
  const candidates = await getClientUpdateCandidates(project.id, start, end)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={update.title}
        description="Review every section before publishing. Homeowners only see published revisions; your drafts stay private."
        icon={Megaphone}
        backHref={clientUpdatesPath(project.id)}
        backLabel="Client updates"
        actions={<ClientUpdateStateBadge update={update} />}
      />
      <ClientUpdateComposer
        key={`${update.id}:${update.version}`}
        projectId={project.id}
        update={update}
        initialSources={sources}
        initialPhotos={photos}
        candidates={candidates}
        canEdit={canEdit}
        aiAvailable={aiAvailable}
      />
    </div>
  )
}
