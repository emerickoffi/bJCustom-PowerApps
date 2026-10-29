import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, ClipboardList, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'
import { requireDailyLogProject } from '@/lib/daily-logs-data'
import {
  DAILY_LOG_PAGE_SIZE,
  DAILY_LOG_STATUS_LABELS,
  dailyLogFilterQuery,
  dailyLogPath,
  dailyLogsPath,
  isDailyLogStatus,
  parseDailyLogFilters,
} from '@/lib/daily-logs'
import { EmptyState, PageHeader, Surface } from '@/components/shared/page-header'
import { DirectoryPagination } from '@/components/shared/directory-pagination'
import { DailyLogStatusBadge } from '@/components/daily-logs/daily-log-report'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export const metadata: Metadata = { title: 'Daily logs' }

type Row = { id: string; log_date: string; status: string; has_delays: boolean; weather_conditions: string | null; work_performed: string | null }

export default async function DailyLogsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const { project } = await requireDailyLogProject(id)
  const filters = parseDailyLogFilters(await searchParams)
  const supabase = await createClient()

  let query = supabase
    .from('daily_logs')
    .select('id, log_date, status, has_delays, weather_conditions, work_performed', { count: 'exact' })
    .eq('project_id', project.id)
  if (filters.from) query = query.gte('log_date', filters.from)
  if (filters.to) query = query.lte('log_date', filters.to)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.delays) query = query.eq('has_delays', true)
  const offset = (filters.page - 1) * DAILY_LOG_PAGE_SIZE
  const { data, count, error } = await query.order('log_date', { ascending: false }).range(offset, offset + DAILY_LOG_PAGE_SIZE - 1)

  const rows = ((data ?? []) as Row[]).filter((r) => isDailyLogStatus(r.status))
  const pageCount = Math.max(1, Math.ceil((count ?? 0) / DAILY_LOG_PAGE_SIZE))
  const base = dailyLogsPath(project.id)
  const filtered = Boolean(filters.from || filters.to || filters.status || filters.delays)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Daily logs"
        description={`A dated record of site activity for ${project.name}. Finalized logs are permanent.`}
        icon={ClipboardList}
        actions={
          !project.archived_at && (
            <Link href={`${base}/new`} className={buttonVariants()}>
              <Plus className="size-4" aria-hidden="true" />
              New daily log
            </Link>
          )
        }
      />

      <Surface aria-label="Filter daily logs">
        <form method="get" className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">From</span>
            <Input type="date" name="from" defaultValue={filters.from ?? ''} className="h-11 md:w-44" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">To</span>
            <Input type="date" name="to" defaultValue={filters.to ?? ''} className="h-11 md:w-44" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Status</span>
            <select name="status" defaultValue={filters.status ?? ''} className="h-11 rounded-md border border-input bg-background px-3 text-sm md:w-40">
              <option value="">All</option>
              {Object.entries(DAILY_LOG_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm text-foreground">
            <input type="checkbox" name="delays" value="1" defaultChecked={filters.delays} className="size-4 accent-primary" />
            Delays only
          </label>
          <div className="flex gap-2">
            <Button type="submit" variant="outline" className="h-11">
              Apply
            </Button>
            {filtered && (
              <Link href={base} className={buttonVariants({ variant: 'ghost', className: 'h-11' })}>
                Clear
              </Link>
            )}
          </div>
        </form>
      </Surface>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          Daily logs could not be loaded. Refresh the page to try again.
        </p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={filtered ? 'No logs match these filters' : 'No daily logs yet'}
          description={filtered ? 'Try a wider date range or clear the filters.' : 'Record the first day of site activity for this project.'}
        />
      ) : (
        <Surface className="p-0 md:p-0">
          <ul className="divide-y divide-border/70">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={dailyLogPath(project.id, r.id)} className="flex flex-col gap-2 px-5 py-4 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none sm:flex-row sm:items-center sm:gap-6">
                  <span className="w-36 shrink-0 font-medium text-foreground">{formatDate(r.log_date)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {r.work_performed || r.weather_conditions || 'No work recorded yet'}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {r.has_delays && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
                        <AlertTriangle className="size-3.5" aria-hidden="true" />
                        Delay
                      </span>
                    )}
                    <DailyLogStatusBadge status={r.status as 'draft' | 'finalized'} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Surface>
      )}

      <DirectoryPagination page={filters.page} pageCount={pageCount} hrefFor={(page) => `${base}${dailyLogFilterQuery(filters, { page })}`} label="Daily log pages" />
    </div>
  )
}
