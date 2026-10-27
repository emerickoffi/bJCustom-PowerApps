import type { Metadata } from 'next'
import Link from 'next/link'
import { FolderKanban, Plus, FolderKanban as FolderKanbanIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requireStaff, canManage } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { PageHeader, EmptyState } from '@/components/shared/page-header'
import { ProjectCard } from '@/components/projects/project-card'
import { getProjectCoverPhotos } from '@/lib/project-photos'
import { ListFilters } from '@/components/shared/list-filters'
import { ALL_PROJECT_STATUSES, PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'
import { sanitizeSearch } from '@/lib/format'
import { PROJECT_SUMMARY_COLUMNS, getProfileNames, type ProjectSummary } from '@/lib/queries'

export const metadata: Metadata = { title: 'Projects' }

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>
}) {
  const session = await requireStaff()
  const params = await searchParams
  const q = sanitizeSearch(params.q)
  const status = ALL_PROJECT_STATUSES.includes(params.status as ProjectStatus)
    ? (params.status as ProjectStatus)
    : null

  const supabase = await createClient()
  let query = supabase
    .from('projects')
    .select(PROJECT_SUMMARY_COLUMNS)
    .eq('organization_id', session.organizationId)
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
    .limit(200)
  if (status) query = query.eq('status', status)
  if (q) query = query.or(`name.ilike.*${q}*,project_number.ilike.*${q}*,address_line1.ilike.*${q}*,city.ilike.*${q}*`)
  const { data } = await query
  const projects = (data ?? []) as unknown as ProjectSummary[]
  const [managerNames, photos] = await Promise.all([
    getProfileNames(projects.map((p) => p.project_manager_id)),
    getProjectCoverPhotos(projects.map((p) => p.id)),
  ])
  const manager = canManage(session.role)
  const filtered = Boolean(q || status)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={FolderKanbanIcon}
        title="Projects"
        description="Every custom home and renovation, from first consultation to final walkthrough."
        actions={
          manager && (
            <Button size="lg" render={<Link href="/projects/new" />} nativeButton={false}>
              <Plus data-icon="inline-start" />
              New project
            </Button>
          )
        }
      />
      <ListFilters
        searchPlaceholder="Search by name, number, or address"
        defaultQuery={q}
        defaultStatus={status ?? ''}
        statusOptions={ALL_PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_LABELS[s] }))}
      />
      {projects.length ? (
        <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={{
                ...p,
                clientName: p.primary_client ? `${p.primary_client.first_name} ${p.primary_client.last_name}` : null,
                managerName: p.project_manager_id ? (managerNames.get(p.project_manager_id) ?? null) : null,
                photoUrl: photos.get(p.id) ?? null,
              }}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={FolderKanban}
          title={filtered ? 'No matching projects' : 'No projects yet'}
          description={
            filtered
              ? 'Try a different search or clear the status filter.'
              : manager
                ? 'Start a project for an existing client to begin tracking it.'
                : 'Projects you are assigned to will appear here.'
          }
          action={
            manager &&
            !filtered && (
              <Button render={<Link href="/projects/new" />} nativeButton={false}>
                Create project
              </Button>
            )
          }
        />
      )}
    </div>
  )
}
