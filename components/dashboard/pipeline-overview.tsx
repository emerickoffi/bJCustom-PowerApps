import Link from 'next/link'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { ALL_PROJECT_STATUSES, PROJECT_PIPELINE, PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'
import { PROJECT_STATUS_STYLES } from '@/components/shared/project-status-banner'
import { cn } from '@/lib/utils'

function percent(count: number, total: number) {
  return total ? Math.round((count / total) * 100) : 0
}

function StageIcon({ status }: { status: ProjectStatus }) {
  const style = PROJECT_STATUS_STYLES[status]
  const Icon = style.icon
  return (
    <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-md', style.className)} aria-hidden="true">
      <Icon className="size-3.5" />
    </span>
  )
}

function StageRow({ status, count, total }: { status: ProjectStatus; count: number; total: number }) {
  const label = PROJECT_STATUS_LABELS[status]
  const share = percent(count, total)
  return (
    <li>
      <Link
        href={`/projects?status=${status}`}
        aria-label={`${label}: ${count} ${count === 1 ? 'project' : 'projects'}, ${share}% of portfolio. View projects.`}
        className="group flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-sage/60 focus-visible:bg-sage/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <StageIcon status={status} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{label}</span>
        <span className="tabular text-xs text-muted-foreground">{`${share}%`}</span>
        <span className="tabular w-6 text-right text-sm font-semibold text-foreground">{count}</span>
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </Link>
    </li>
  )
}

function Metric({ label, value, emphasis }: { label: string; value: number; emphasis?: boolean }) {
  return (
    <div className={cn('flex flex-col gap-0.5 rounded-lg border px-3 py-2.5', emphasis ? 'border-primary/15 bg-sage/60' : 'bg-card')}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('tabular font-serif text-2xl font-semibold leading-tight', emphasis ? 'text-primary' : 'text-foreground')}>
        {value}
      </dd>
    </div>
  )
}

export function PipelineOverview({ counts }: { counts: Partial<Record<ProjectStatus, number>> }) {
  const countOf = (s: ProjectStatus) => counts[s] ?? 0
  const total = ALL_PROJECT_STATUSES.reduce((sum, s) => sum + countOf(s), 0)
  const completed = countOf('completed')
  const inPipeline = PROJECT_PIPELINE.filter((s) => s !== 'completed').reduce((sum, s) => sum + countOf(s), 0)
  const onHold = countOf('on_hold')
  const cancelled = countOf('cancelled')

  const segments = ALL_PROJECT_STATUSES.filter((s) => countOf(s) > 0)
  const populated = PROJECT_PIPELINE.filter((s) => countOf(s) > 0)
  const empty = PROJECT_PIPELINE.filter((s) => countOf(s) === 0)

  return (
    <section aria-labelledby="pipeline-heading" className="surface flex flex-col gap-5 p-5 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="pipeline-heading" className="font-serif text-xl font-semibold tracking-tight text-foreground">
            Project pipeline
          </h2>
          <p className="text-sm text-muted-foreground">Portfolio distribution from first call to handover</p>
        </div>
        <div className="flex gap-2 text-xs">
          <Link
            href="/projects?status=on_hold"
            className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700 ring-1 ring-inset ring-red-600/15 transition-colors hover:bg-red-100"
          >
            <span className="size-1.5 rounded-full bg-red-600" aria-hidden="true" />
            {`${onHold} on hold`}
          </Link>
          <Link
            href="/projects?status=cancelled"
            className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground ring-1 ring-inset ring-border transition-colors hover:bg-muted/70"
          >
            <span className="size-1.5 rounded-full bg-slate-500" aria-hidden="true" />
            {`${cancelled} cancelled`}
          </Link>
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
        <Metric label="Total projects" value={total} />
        <Metric label="In pipeline" value={inPipeline} emphasis />
        <Metric label="Completed" value={completed} />
      </dl>

      {total > 0 ? (
        <div
          role="img"
          aria-label={`Portfolio distribution: ${segments
            .map((s) => `${PROJECT_STATUS_LABELS[s]} ${countOf(s)} (${percent(countOf(s), total)}%)`)
            .join(', ')}`}
          className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-sage/70"
        >
          {segments.map((s) => (
            <span
              key={s}
              title={`${PROJECT_STATUS_LABELS[s]}: ${countOf(s)}`}
              className={cn('h-full first:rounded-l-full last:rounded-r-full', PROJECT_STATUS_STYLES[s].className)}
              style={{ width: `${(countOf(s) / total) * 100}%` }}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No projects yet.</p>
      )}

      {populated.length > 0 && (
        <ol className="-mx-2 flex flex-col" aria-label="Stages with projects">
          {populated.map((s) => (
            <StageRow key={s} status={s} count={countOf(s)} total={total} />
          ))}
        </ol>
      )}

      {empty.length > 0 && (
        <details className="group border-t pt-3">
          <summary className="-mx-2 flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span>{`Other stages (${empty.length})`}</span>
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <ol className="-mx-2 mt-1 flex flex-col" aria-label="Stages without projects">
            {empty.map((s) => (
              <StageRow key={s} status={s} count={0} total={total} />
            ))}
          </ol>
        </details>
      )}
    </section>
  )
}
