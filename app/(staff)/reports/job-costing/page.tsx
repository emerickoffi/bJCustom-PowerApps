import type { Metadata } from 'next'
import Link from 'next/link'
import { ChartColumn, Download, TriangleAlert } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { getOrgFeatures, requireFeature } from '@/lib/features'
import { loadJobCostingReport, REPORT_MAX_JOBS } from '@/lib/job-costing-report-data'
import { reportTotals, type JobCostReportRow, type ReportScope } from '@/lib/job-costing-report'
import { formatBasisPoints } from '@/lib/job-costing'
import { formatMoney } from '@/lib/financials'
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { PageHeader, pageLayout } from '@/components/shared/page-header'

export const metadata: Metadata = { title: 'Job costing' }

const SCOPES: { value: ReportScope; label: string }[] = [
  { value: 'active', label: 'Active jobs' },
  { value: 'completed', label: 'Completed' },
  { value: 'all', label: 'All jobs' },
]

const money = (cents: number | null) => (cents === null ? '—' : formatMoney(cents))

function OverUnder({ cents }: { cents: number | null }) {
  if (cents === null) return <span className="text-muted-foreground">—</span>
  if (cents === 0) return <span className="text-muted-foreground">On budget</span>
  return cents < 0 ? (
    <span className="font-medium text-destructive">{formatMoney(-cents)} over</span>
  ) : (
    <span className="text-[#187542]">{formatMoney(cents)} under</span>
  )
}

function Flag({ row }: { row: JobCostReportRow }) {
  if (row.failed) return <span className="text-xs text-muted-foreground">Could not load</span>
  if (row.noBudget) return <span className="text-xs text-muted-foreground">No approved estimate yet</span>
  if (row.flag === 'over') return <span className="rounded-full bg-[#FDE8E7] px-2 py-0.5 text-xs font-medium text-[#BD302B]">Over budget</span>
  if (row.flag === 'low_margin') return <span className="rounded-full bg-[#FFF2DA] px-2 py-0.5 text-xs font-medium text-[#96570E]">Low margin</span>
  return null
}

function Card({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: 'bad' }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn('text-xl font-semibold tabular-nums text-foreground', tone === 'bad' && 'text-destructive')}>{value}</dd>
      <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
    </div>
  )
}

/**
 * Every job's contract, budget, cost and projected profit on one page. Each row uses the same numbers as that project's
 * Financials tab, and clicking a job opens it.
 */
export default async function JobCostingReportPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'project_reports')
  const { scope: rawScope } = await searchParams
  const scope: ReportScope = SCOPES.some((s) => s.value === rawScope) ? (rawScope as ReportScope) : 'active'

  const [{ rows, truncated }, features] = await Promise.all([loadJobCostingReport(session.organizationId, scope), getOrgFeatures(session.organizationId)])
  const totals = reportTotals(rows)
  const canExport = features.data_exports && session.role === 'org_admin'

  return (
    <div className={pageLayout('workspace', 'gap-4 md:gap-5')}>
      <PageHeader
        icon={ChartColumn}
        title="Job Costing" backHref="/reports" backLabel="Reports"
        actions={
          rows.length > 0 && (
            <Button variant="outline" render={<a href={`/api/reports/job-costing?scope=${scope}`} download />} nativeButton={false}>
              <Download data-icon="inline-start" />
              Download CSV
            </Button>
          )
        }
      />

      <nav aria-label="Which jobs" className="flex flex-wrap gap-2">
        {SCOPES.map((s) => (
          <Link
            key={s.value}
            href={s.value === 'active' ? '/reports/job-costing' : `/reports/job-costing?scope=${s.value}`}
            aria-current={s.value === scope ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
              s.value === scope ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            {s.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="font-medium text-foreground">No jobs here yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {scope === 'active' ? 'Jobs show up here from preconstruction until they are completed.' : 'Try another view above.'}
          </p>
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card label="Contract value" value={money(totals.contractCents)} hint="Approved estimates plus approved change orders." />
            <Card label="Cost to date" value={money(totals.costToDateCents)} hint="Approved vendor bills and approved crew time." />
            <Card
              label="Projected profit"
              value={totals.profitCents === null ? '—' : `${formatMoney(totals.profitCents)} · ${formatBasisPoints(totals.marginBasisPoints)}`}
              hint="Contract value minus projected final cost."
              tone={totals.profitCents !== null && totals.profitCents < 0 ? 'bad' : undefined}
            />
            <Card
              label="Jobs over budget"
              value={`${totals.overBudget} of ${totals.jobs}`}
              hint="Projected to cost more than their budget."
              tone={totals.overBudget > 0 ? 'bad' : undefined}
            />
          </dl>

          {totals.overBudget > 0 && (
            <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-foreground">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
              {totals.overBudget === 1 ? '1 job is' : `${totals.overBudget} jobs are`} projected to go over budget. They are listed first.
            </p>
          )}

          {/* Phones: one card per job */}
          <ul className="flex flex-col gap-2 md:hidden">
            {rows.map((r) => (
              <li key={r.projectId}>
                <Link href={`/projects/${r.projectId}/financials`} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-foreground">{r.name}</span>
                    <Flag row={r} />
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <dt className="text-muted-foreground">Contract</dt>
                    <dd className="text-right tabular-nums">{money(r.contractCents)}</dd>
                    <dt className="text-muted-foreground">Cost to date</dt>
                    <dd className="text-right tabular-nums">{money(r.costToDateCents)}</dd>
                    <dt className="text-muted-foreground">Budget</dt>
                    <dd className="text-right tabular-nums">
                      <OverUnder cents={r.overUnderCents} />
                    </dd>
                    <dt className="text-muted-foreground">Projected profit</dt>
                    <dd className="text-right tabular-nums">
                      {money(r.profitCents)} {r.marginBasisPoints !== null && <span className="text-muted-foreground">· {formatBasisPoints(r.marginBasisPoints)}</span>}
                    </dd>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>

          {/* Tablets and computers: one table */}
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
            <table className="w-full min-w-[56rem] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Job</th>
                  <th className="px-4 py-2.5 text-right font-medium">Contract</th>
                  <th className="px-4 py-2.5 text-right font-medium">Budget</th>
                  <th className="px-4 py-2.5 text-right font-medium">Cost to date</th>
                  <th className="px-4 py-2.5 text-right font-medium">Projected final cost</th>
                  <th className="px-4 py-2.5 text-right font-medium">Over / under budget</th>
                  <th className="px-4 py-2.5 text-right font-medium">Projected profit</th>
                  <th className="px-4 py-2.5 text-right font-medium">Margin</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.projectId} className="border-b border-border/70 last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link href={`/projects/${r.projectId}/financials`} className="font-medium text-foreground hover:underline">
                        {r.name}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {r.projectNumber && <span>{r.projectNumber}</span>}
                        <span>{PROJECT_STATUS_LABELS[r.status as ProjectStatus] ?? r.status}</span>
                        <Flag row={r} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(r.contractCents)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(r.budgetCents)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(r.costToDateCents)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(r.forecastCents)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <OverUnder cents={r.overUnderCents} />
                    </td>
                    <td className={cn('px-4 py-3 text-right tabular-nums', r.profitCents !== null && r.profitCents < 0 && 'text-destructive')}>
                      {money(r.profitCents)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatBasisPoints(r.marginBasisPoints)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                  <td className="px-4 py-3">Total ({totals.jobs - totals.noBudget} with a budget)</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(totals.contractCents)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(totals.budgetCents)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(totals.costToDateCents)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(totals.forecastCents)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <OverUnder cents={totals.overUnderCents} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(totals.profitCents)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatBasisPoints(totals.marginBasisPoints)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            Projected final cost is cost to date plus what's still committed or expected, per cost category, the same way each project's
            Financials tab works. Click a job to see the details.
            {truncated && ` Showing the first ${REPORT_MAX_JOBS} jobs.`}
            {canExport && (
              <>
                {' '}
                Need the raw records? Go to{' '}
                <Link href="/reports/exports" className="underline">
                  Data Exports
                </Link>
                .
              </>
            )}
          </p>
        </>
      )}
    </div>
  )
}
