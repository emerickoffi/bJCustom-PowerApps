import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarClock, Download, TriangleAlert } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { loadScheduleReport } from '@/lib/schedule-report-data'
import { LOOKAHEAD_OPTIONS, parseLookahead, type ReportActivity } from '@/lib/schedule-report'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { PageHeader, pageLayout } from '@/components/shared/page-header'
import { DeferredPrintButton } from '@/components/print/deferred-print-button'

export const metadata: Metadata = { title: 'Schedule report' }

const short = (iso: string | null) => (iso ? formatDate(iso) : '—')
const dates = (a: ReportActivity) =>
  a.planned_start && a.planned_end && a.planned_start !== a.planned_end ? `${short(a.planned_start)} – ${short(a.planned_end)}` : short(a.planned_start ?? a.planned_end)
const who = (a: ReportActivity) => (a.who.length ? a.who.join(', ') : 'Unassigned')

function JobLink({ a }: { a: ReportActivity }) {
  return (
    <Link href={`/projects/${a.project_id}/schedule`} className="text-muted-foreground hover:text-foreground hover:underline">
      {a.project_name}
    </Link>
  )
}

/** What's behind and what's coming up across every active job, on one printable page for the weekly meeting. */
export default async function ScheduleReportPage({ searchParams }: { searchParams: Promise<{ weeks?: string }> }) {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'schedule_reports')
  const weeks = parseLookahead((await searchParams).weeks)
  const report = await loadScheduleReport(session.organizationId, weeks)
  const upcomingCount = report.weeks.reduce((n, w) => n + w.items.length, 0)

  return (
    <div className={pageLayout('workspace', 'gap-4 md:gap-5')}>
      <PageHeader
        icon={CalendarClock}
        title="Schedule Report" backHref="/reports" backLabel="Reports"
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Button variant="outline" render={<a href={`/api/reports/schedule?weeks=${weeks}`} download />} nativeButton={false}>
              <Download data-icon="inline-start" />
              Download CSV
            </Button>
            <DeferredPrintButton />
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="How far ahead" className="flex flex-wrap gap-2 print:hidden">
          {LOOKAHEAD_OPTIONS.map((w) => (
            <Link
              key={w}
              href={w === 2 ? '/reports/schedule' : `/reports/schedule?weeks=${w}`}
              aria-current={w === weeks ? 'page' : undefined}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                w === weeks ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              Next {w} weeks
            </Link>
          ))}
        </nav>
        <p className="text-sm text-muted-foreground">
          As of {formatDate(report.today)} · active jobs · next {weeks} weeks
        </p>
      </div>

      {/* Behind schedule */}
      <section className="flex flex-col gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <TriangleAlert className={cn('size-4', report.late.length ? 'text-destructive' : 'text-muted-foreground')} aria-hidden="true" />
          Behind schedule <span className="font-normal text-muted-foreground">({report.late.length})</span>
        </h2>
        {report.late.length === 0 ? (
          <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">Nothing is delayed or past its planned finish.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
            {report.late.map((a) => (
              <li key={a.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 print:break-inside-avoid">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{a.name}</p>
                  <p className="text-sm">
                    <JobLink a={a} /> <span className="text-muted-foreground">· {who(a)}</span>
                  </p>
                  {a.delay_reason && <p className="mt-0.5 text-sm text-muted-foreground">Reason: {a.delay_reason}</p>}
                </div>
                <div className="shrink-0 text-sm sm:text-right">
                  <p className="font-medium text-destructive">
                    {a.daysLate ? `${a.daysLate} day${a.daysLate === 1 ? '' : 's'} late` : 'Marked delayed'}
                  </p>
                  <p className="text-muted-foreground">Planned finish {short(a.planned_end)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Coming up */}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-foreground">
          Coming up <span className="font-normal text-muted-foreground">({upcomingCount})</span>
        </h2>
        {report.weeks.length === 0 ? (
          <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            Nothing scheduled in the next {weeks} weeks. Activities need planned dates to show up here.
          </p>
        ) : (
          report.weeks.map((w) => (
            <div key={w.start} className="flex flex-col gap-1.5 print:break-inside-avoid">
              <h3 className="text-sm font-semibold text-muted-foreground">{w.label}</h3>
              <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
                {w.items.map((a) => (
                  <li key={a.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">
                        {a.name}
                        {a.activity_type === 'inspection' && <span className="ml-2 rounded-full bg-[#E5F4F7] px-2 py-0.5 text-xs font-medium text-[#007F95]">Inspection</span>}
                        {a.status === 'in_progress' && <span className="ml-2 text-xs font-normal text-muted-foreground">In progress · {Math.round(a.percent_complete)}%</span>}
                      </p>
                      <p className="text-sm">
                        <JobLink a={a} /> <span className="text-muted-foreground">· {who(a)}</span>
                      </p>
                    </div>
                    <p className="shrink-0 text-sm tabular-nums text-muted-foreground sm:text-right">{dates(a)}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      {report.truncated && <p className="text-xs text-muted-foreground">Showing the first 5,000 open activities.</p>}
    </div>
  )
}
