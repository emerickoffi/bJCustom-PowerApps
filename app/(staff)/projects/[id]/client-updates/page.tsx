import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, Megaphone, Plus } from 'lucide-react'
import { requireClientUpdateProject, listClientUpdates } from '@/lib/client-updates-data'
import { clientUpdatesPath, formatPeriod } from '@/lib/client-updates'
import { createClientUpdateAction } from '@/app/actions/client-updates'
import { EmptyState, PageHeader, Surface } from '@/components/shared/page-header'
import { ClientUpdateStateBadge } from '@/components/client-updates/client-update-state-badge'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/format'

export const metadata: Metadata = { title: 'Client updates' }

export default async function ClientUpdatesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params
  const { error } = await searchParams
  const { project, canEdit } = await requireClientUpdateProject(id)
  const updates = await listClientUpdates(project.id)
  const base = clientUpdatesPath(project.id)

  const newButton = canEdit && (
    <form action={createClientUpdateAction}>
      <input type="hidden" name="project_id" value={project.id} />
      <Button type="submit">
        <Plus className="size-4" aria-hidden="true" />
        New client update
      </Button>
    </form>
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Client updates"
        description={`Progress reports for the homeowners of ${project.name}. Nothing is shared until a manager publishes it, and publishing never sends email or texts.`}
        icon={Megaphone}
        actions={newButton}
      />

      {error && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error === 'permission' ? 'Only administrators and project managers can create client updates.' : 'The update could not be created. Try again.'}
        </p>
      )}

      {updates.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No client updates yet"
          description="Start a draft from this week's finalized daily logs and published schedule, choose a few photos, then publish it to the homeowner portal."
          action={newButton || undefined}
        />
      ) : (
        <Surface aria-label="Client updates" className="p-0 md:p-0">
          <ul className="divide-y">
            {updates.map((u) => (
              <li key={u.id}>
                <Link href={`${base}/${u.id}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none md:px-6">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-foreground">{u.title}</span>
                      <ClientUpdateStateBadge update={u} />
                      {u.revision > 1 && <span className="text-xs text-muted-foreground">Revision {u.revision}</span>}
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {formatPeriod(u.period_start, u.period_end)}
                      {u.last_published_at ? ` · Published ${formatDate(u.last_published_at)}` : ` · Edited ${formatDate(u.updated_at)}`}
                    </span>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </Surface>
      )}
    </div>
  )
}
