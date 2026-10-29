import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, ClipboardList, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { formatDate, sanitizeSearch } from '@/lib/format'
import { getPeopleNames } from '@/lib/people'
import { getDailyLogProjectOptions } from '@/lib/daily-logs-data'
import {
  DAILY_LOG_DIRECTORY_PATH,
  DAILY_LOG_PAGE_SIZE,
  DAILY_LOG_STATUS_LABELS,
  dailyLogDirectoryQuery,
  dailyLogPath,
  isDailyLogStatus,
  parseDailyLogDirectoryFilters,
  type DailyLogStatus,
} from '@/lib/daily-logs'
import { EmptyState, PageHeader, Surface } from '@/components/shared/page-header'
import { DirectoryPagination } from '@/components/shared/directory-pagination'
import { SearchInput } from '@/components/shared/search-input'
import { DailyLogStatusBadge } from '@/components/daily-logs/daily-log-report'
import { Button, buttonVariants } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Daily logs' }

type Row = {
  id: string
  project_id: string
  log_date: string
  status: string
  has_delays: boolean
  work_performed: string | null
  created_by: string | null
  author_id: string | null
}

const SELECT_CLASS = 'h-11 rounded-md border border-input bg-background px-3 text-sm md:w-48'

export default async function DailyLogsDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireStaff()
  await requireFeature(session.organizationId, 'daily_logs')
  const filters = parseDailyLogDirectoryFilters(await searchParams)
  const projects = await getDailyLogProjectOptions(session.organizationId)
  const projectById = new Map(projects.map((p) => [p.id, p]))
  const canCreate = projects.some((p) => !p.archived_at)

  const supabase = await createClient()
  let query = supabase
    .from('daily_logs')
    .select('id, project_id, log_date, status, has_delays, work_performed, created_by, author_id', { count: 'exact' })
    .eq('organization_id', session.organizationId)
  if (filters.project) query = query.eq('project_id', filters.project)
  if (filters.status) query = query.eq('status', filters.status)

  const term = sanitizeSearch(filters.q)
  if (term) {
    const needle = term.toLowerCase()
    const matchingProjects = projects
      .filter((p) => p.name.toLowerCase().includes(needle) || p.project_number?.toLowerCase().includes(needle))
      .map((p) => p.id)
    const clauses = [`work_performed.ilike.*${term}*`]
    if (matchingProjects.length) clauses.push(`project_id.in.(${matchingProjects.join(',')})`)
    query = query.or(clauses.join(','))
  }

  const offset = (filters.page - 1) * DAILY_LOG_PAGE_SIZE
  const { data, count, error } = await query
    .order('log_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + DAILY_LOG_PAGE_SIZE - 1)

  const setupRequired = error?.code === '42P01' || error?.code === 'PGRST205'
  const rows = ((data ?? []) as Row[]).filter((r) => isDailyLogStatus(r.status))
  const names = await getPeopleNames(rows.map((r) => r.created_by ?? r.author_id))
  const pageCount = Math.max(1, Math.ceil((count ?? 0) / DAILY_LOG_PAGE_SIZE))
  const filtered = Boolean(filters.q || filters.project || filters.status)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Daily logs"
        description="Site activity across every project you have access to. Open a log to view or edit it inside its project."
        icon={ClipboardList}
        actions={
          canCreate && !setupRequired && (
            <Link href={`${DAILY_LOG_DIRECTORY_PATH}/new`} className={buttonVariants()}>
              <Plus className="size-4" aria-hidden="true" />
              New daily log
            </Link>
          )
        }
      />

      <Surface aria-label="Filter daily logs">
        <form method="get" className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm md:min-w-64">
            <span className="font-medium text-foreground" aria-hidden="true">
              Search
            </span>
            <SearchInput id="daily-log-search" label="Search daily logs" defaultValue={filters.q} placeholder="Project name, number, or work performed" />
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Project</span>
            <select name="project" defaultValue={filters.project ?? ''} className={SELECT_CLASS}>
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.archived_at ? ' (archived)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Status</span>
            <select name="status" defaultValue={filters.status ?? ''} className={SELECT_CLASS}>
              <option value="">All</option>
              {Object.entries(DAILY_LOG_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <Button type="submit" variant="outline" className="h-11">
              Apply
            </Button>
            {filtered && (
              <Link href={DAILY_LOG_DIRECTORY_PATH} className={buttonVariants({ variant: 'ghost', className: 'h-11' })}>
                Clear
              </Link>
            )}
          </div>
        </form>
      </Surface>

      {setupRequired ? (
        <EmptyState
          icon={ClipboardList}
          title="Daily logs are not set up in the database yet"
          description="An administrator needs to apply the Daily Logs migration before logs can be listed here."
        />
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          Daily logs could not be loaded. Refresh the page to try again.
        </p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={filtered ? 'No logs match these filters' : 'No daily logs yet'}
          description={
            filtered
              ? 'Try a different search, project, or status.'
              : canCreate
                ? 'Choose a project to record its first day of site activity.'
                : 'Logs appear here once they are recorded on a project you are assigned to.'
          }
        />
      ) : (
        <Surface className="p-0 md:p-0">
          <div
            className="hidden gap-6 border-b border-border/70 px-5 py-3 text-xs font-medium tracking-wide text-muted-foreground uppercase md:flex"
            aria-hidden="true"
          >
            <span className="w-32 shrink-0">Log date</span>
            <span className="min-w-0 flex-1">Project</span>
            <span className="w-40 shrink-0">Created by</span>
            <span className="w-32 shrink-0 text-right">Status</span>
          </div>
          <ul className="divide-y divide-border/70">
            {rows.map((r) => {
              const project = projectById.get(r.project_id)
              const creatorId = r.created_by ?? r.author_id
              return (
                <li key={r.id}>
                  <Link
                    href={dailyLogPath(r.project_id, r.id)}
                    className="flex flex-col gap-1.5 px-5 py-4 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none md:flex-row md:items-center md:gap-6"
                  >
                    <span className="w-32 shrink-0 font-medium text-foreground">{formatDate(r.log_date)}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium text-foreground">
                        {project?.name ?? 'Project'}
                        {project?.project_number && <span className="font-normal text-muted-foreground">{` · ${project.project_number}`}</span>}
                      </span>
                      <span className="truncate text-sm text-muted-foreground">{r.work_performed || 'No work recorded yet'}</span>
                    </span>
                    <span className="w-40 shrink-0 truncate text-sm text-muted-foreground">
                      <span className="md:sr-only">Created by </span>
                      {(creatorId && names[creatorId]) || 'Team member'}
                    </span>
                    <span className="flex w-32 shrink-0 items-center gap-2 md:justify-end">
                      {r.has_delays && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
                          <AlertTriangle className="size-3.5" aria-hidden="true" />
                          Delay
                        </span>
                      )}
                      <DailyLogStatusBadge status={r.status as DailyLogStatus} />
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </Surface>
      )}

      <DirectoryPagination
        page={filters.page}
        pageCount={pageCount}
        hrefFor={(page) => `${DAILY_LOG_DIRECTORY_PATH}${dailyLogDirectoryQuery(filters, { page })}`}
        label="Daily log pages"
      />
    </div>
  )
}
