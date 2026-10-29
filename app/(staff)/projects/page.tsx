import type { Metadata } from 'next'
import Link from 'next/link'
import { FolderKanban, Home, Plus, UserRound, FolderKanban as FolderKanbanIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requireStaff, canManage } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { PageHeader, EmptyState } from '@/components/shared/page-header'
import { CompactProjectCard } from '@/components/dashboard/compact-project-card'
import { getOrgFeatures } from '@/lib/features'
import { getDashboardCardDetails } from '@/lib/dashboard-cards'
import { getProjectCoverPhotos } from '@/lib/project-photos'
import { ListFilters } from '@/components/shared/list-filters'
import { ALL_PROJECT_STATUSES, PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'
import { sanitizeSearch } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PROJECT_SUMMARY_COLUMNS, getProfileNames, type ProjectSummary } from '@/lib/queries'

export const metadata: Metadata = { title: 'Projects' }

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; state?: string; city?: string }>
}) {
  const session = await requireStaff()
  const params = await searchParams
  const q = sanitizeSearch(params.q)
  const status = ALL_PROJECT_STATUSES.includes(params.status as ProjectStatus)
    ? (params.status as ProjectStatus)
    : null

  const supabase = await createClient()
  const { data: locationRows } = await supabase
    .from('projects')
    .select('city, state')
    .eq('organization_id', session.organizationId)
    .is('archived_at', null)
  const stateNames = new Map<string, string>()
  const locationMap = new Map<string, { city: string; state: string }>()
  for (const row of locationRows ?? []) {
    const city = (row.city ?? '').trim()
    const rawState = (row.state ?? '').trim()
    if (!city && !rawState) continue
    const stateKey = rawState.toLowerCase()
    if (!stateNames.has(stateKey)) stateNames.set(stateKey, rawState)
    const state = stateNames.get(stateKey)!
    const key = `${city.toLowerCase()}|${stateKey}`
    if (!locationMap.has(key)) locationMap.set(key, { city, state })
  }
  const locations = [...locationMap.values()]
  const stateFilter = stateNames.get(params.state?.trim().toLowerCase() ?? '') ?? ''
  const cityFilter =
    locations.find(
      (l) => l.city.toLowerCase() === params.city?.trim().toLowerCase() && (!stateFilter || l.state === stateFilter),
    )?.city ?? ''
  const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&')

  let query = supabase
    .from('projects')
    .select(`${PROJECT_SUMMARY_COLUMNS}, completion_date`)
    .eq('organization_id', session.organizationId)
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
    .limit(200)
  if (status) query = query.eq('status', status)
  if (stateFilter) query = query.ilike('state', escapeLike(stateFilter))
  if (cityFilter) query = query.ilike('city', escapeLike(cityFilter))
  if (q)
    query = query.or(
      `name.ilike.*${q}*,project_number.ilike.*${q}*,address_line1.ilike.*${q}*,city.ilike.*${q}*,state.ilike.*${q}*`,
    )
  const { data } = await query
  const projects = (data ?? []) as unknown as (ProjectSummary & { completion_date: string | null })[]
  const features = await getOrgFeatures(session.organizationId)
  const [managerNames, photos, cardDetails] = await Promise.all([
    getProfileNames(projects.map((p) => p.project_manager_id)),
    getProjectCoverPhotos(projects.map((p) => p.id)),
    getDashboardCardDetails(session.organizationId, projects, features),
  ])
  const manager = canManage(session.role)
  const filtered = Boolean(q || status || stateFilter || cityFilter)

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
        searchPlaceholder="Search by name, number, address, city, or state"
        defaultQuery={q}
        defaultStatus={status ?? ''}
        statusOptions={ALL_PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_LABELS[s] }))}
        location={{ options: locations, defaultState: stateFilter, defaultCity: cityFilter }}
        clearHref={filtered ? '/projects' : undefined}
      />
      {projects.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const clientName = p.primary_client
              ? `${p.primary_client.first_name} ${p.primary_client.last_name}`
              : null
            const managerName = p.project_manager_id ? (managerNames.get(p.project_manager_id) ?? null) : null
            return (
              <CompactProjectCard
                key={p.id}
                project={{
                  ...p,
                  completion_date: p.completion_date ?? null,
                  photoUrl: photos.get(p.id)?.url ?? null,
                  photoKind: photos.get(p.id)?.kind ?? null,
                  details: cardDetails.get(p.id)!,
                  warrantyEnabled: features.warranty,
                }}
                footer={
                  <dl className="grid grid-cols-2 gap-4 border-t pt-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <dt className="flex items-center gap-1 text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">
                        <Home className="size-3 shrink-0" aria-hidden="true" />
                        Homeowner
                      </dt>
                      <dd
                        className={cn('truncate text-sm', clientName ? 'font-medium text-foreground' : 'text-muted-foreground')}
                        title={clientName ?? undefined}
                      >
                        {clientName ?? 'Not linked'}
                      </dd>
                    </div>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <dt className="flex items-center gap-1 text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">
                        <UserRound className="size-3 shrink-0" aria-hidden="true" />
                        Project manager
                      </dt>
                      <dd
                        className={cn('truncate text-sm', managerName ? 'font-medium text-foreground' : 'text-muted-foreground')}
                        title={managerName ?? undefined}
                      >
                        {managerName ?? 'Unassigned'}
                      </dd>
                    </div>
                  </dl>
                }
              />
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon={FolderKanban}
          title={filtered ? 'No matching projects' : 'No projects yet'}
          description={
            filtered
              ? 'Try a different search, or clear the status and location filters.'
              : manager
                ? 'Start a project for an existing client to begin tracking it.'
                : 'Projects you are assigned to will appear here.'
          }
          action={
            filtered ? (
              <Button variant="outline" render={<Link href="/projects" />} nativeButton={false}>
                Clear filters
              </Button>
            ) : (
              manager && (
                <Button render={<Link href="/projects/new" />} nativeButton={false}>
                  Create project
                </Button>
              )
            )
          }
        />
      )}
    </div>
  )
}
