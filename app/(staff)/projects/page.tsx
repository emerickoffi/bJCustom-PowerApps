import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { DirectoryViews } from '@/components/shared/directory-views'
import { DirectorySort } from '@/components/shared/directory-sort'
import { DirectoryPagination } from '@/components/shared/directory-pagination'
import { ProjectTable } from '@/components/projects/project-table'
import {
  DIRECTORY_VIEW_COOKIE,
  PROJECT_SORTS,
  directoryHref,
  pageBounds,
  parsePage,
  parseSort,
  parseView,
  resultRange,
  sortOptions,
  totalPages,
  type SortOrder,
} from '@/lib/directory'
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
import { ALL_PROJECT_STATUSES, PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS, type ProjectStatus } from '@/lib/domain'
import { sanitizeSearch } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PROJECT_SUMMARY_COLUMNS, getProfileNames, type ProjectSummary } from '@/lib/queries'

export const metadata: Metadata = { title: 'Projects' }

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    status?: string
    type?: string
    state?: string
    city?: string
    sort?: string
    page?: string
    view?: string
  }>
}) {
  const session = await requireStaff()
  const params = await searchParams
  const q = sanitizeSearch(params.q)
  const status = ALL_PROJECT_STATUSES.includes(params.status as ProjectStatus)
    ? (params.status as ProjectStatus)
    : null
  const projectType = params.type && Object.hasOwn(PROJECT_TYPE_LABELS, params.type) ? params.type : null
  const sort = parseSort(params.sort, PROJECT_SORTS, 'updated')
  const page = parsePage(params.page)
  const urlView = parseView(params.view)
  const initialView = urlView ?? parseView((await cookies()).get(DIRECTORY_VIEW_COOKIE.projects)?.value)

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

  const stateParams = {
    q,
    status,
    type: projectType,
    state: stateFilter || null,
    city: cityFilter || null,
    sort: sort === 'updated' ? null : sort,
    view: urlView,
  }
  const hrefFor = (p: number) => directoryHref('/projects', { ...stateParams, page: p })

  const { from, to } = pageBounds(page)
  let query = supabase
    .from('projects')
    .select(`${PROJECT_SUMMARY_COLUMNS}, completion_date`, { count: 'exact' })
    .eq('organization_id', session.organizationId)
    .is('archived_at', null)
  if (status) query = query.eq('status', status)
  if (projectType) query = query.eq('project_type', projectType)
  if (stateFilter) query = query.ilike('state', escapeLike(stateFilter))
  if (cityFilter) query = query.ilike('city', escapeLike(cityFilter))
  if (q)
    query = query.or(
      `name.ilike.*${q}*,project_number.ilike.*${q}*,address_line1.ilike.*${q}*,city.ilike.*${q}*,state.ilike.*${q}*`,
    )
  for (const order of PROJECT_SORTS[sort].orders as readonly SortOrder[]) {
    query = query.order(order.column, { ascending: order.ascending, nullsFirst: order.nullsFirst })
  }
  const { data, count, error } = await query.range(from, to)
  const total = count ?? 0
  const pageCount = totalPages(total)
  if (page > 1 && (error || page > pageCount)) redirect(hrefFor(Math.min(page, pageCount)))
  const projects = (data ?? []) as unknown as (ProjectSummary & {
    completion_date: string | null
    target_completion_date?: string | null
  })[]
  const features = await getOrgFeatures(session.organizationId)
  const [managerNames, photos, cardDetails] = await Promise.all([
    getProfileNames(projects.map((p) => p.project_manager_id)),
    getProjectCoverPhotos(projects.map((p) => p.id)),
    getDashboardCardDetails(session.organizationId, projects, features),
  ])
  const manager = canManage(session.role)
  const filtered = Boolean(q || status || projectType || stateFilter || cityFilter)
  const range = resultRange(page, projects.length, total)
  const rows = projects.map((p) => ({
    ...p,
    completion_date: p.completion_date ?? null,
    target_completion_date: p.target_completion_date ?? null,
    photoUrl: photos.get(p.id)?.url ?? null,
    photoKind: photos.get(p.id)?.kind ?? null,
    details: cardDetails.get(p.id)!,
    warrantyEnabled: features.warranty,
    managerName: p.project_manager_id ? (managerNames.get(p.project_manager_id) ?? null) : null,
  }))

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
        selects={[
          {
            name: 'type',
            label: 'Project type',
            allLabel: 'All project types',
            defaultValue: projectType ?? '',
            options: Object.entries(PROJECT_TYPE_LABELS).map(([value, label]) => ({ value, label })),
          },
        ]}
        location={{ options: locations, defaultState: stateFilter, defaultCity: cityFilter }}
        clearHref={filtered ? directoryHref('/projects', { sort: stateParams.sort, view: urlView }) : undefined}
        preserve={{ sort: stateParams.sort, view: urlView }}
      />
      {projects.length ? (
        <div className="flex flex-col gap-4">
        <DirectoryViews
          module="projects"
          initialView={initialView}
          desktopDefault="cards"
          summary={`Showing ${range.start}–${range.end} of ${total} ${total === 1 ? 'project' : 'projects'}`}
          controls={<DirectorySort value={sort} options={sortOptions(PROJECT_SORTS)} />}
          table={<ProjectTable rows={rows} />}
          cards={
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => {
            const p = row
            const clientName = p.primary_client
              ? `${p.primary_client.first_name} ${p.primary_client.last_name}`
              : null
            const managerName = row.managerName
            return (
              <CompactProjectCard
                key={p.id}
                project={row}
                showType
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
          }
        />
          <DirectoryPagination page={page} pageCount={pageCount} hrefFor={hrefFor} label="Projects pagination" />
        </div>
      ) : (
        <EmptyState
          icon={FolderKanban}
          title={filtered ? 'No matching projects' : 'No projects yet'}
          description={
            filtered
              ? 'Try a different search, or clear the status, type, and location filters.'
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
