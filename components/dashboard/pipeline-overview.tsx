import Link from 'next/link'
import { ALL_PROJECT_STATUSES, PROJECT_PIPELINE, PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'
import { PROJECT_STATUS_STYLES } from '@/components/shared/project-status-banner'
import { cn } from '@/lib/utils'

function percent(count: number, total: number) {
  return total ? Math.round((count / total) * 100) : 0
}

function Metric({ label, value, emphasis }: { label: string; value: number; emphasis?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn('tabular font-serif text-lg font-semibold leading-none', emphasis ? 'text-primary' : 'text-foreground')}>
        {value}
      </dd>
    </div>
  )
}

function StageChip({ status, count, total }: { status: ProjectStatus; count: number; total: number }) {
  const label = PROJECT_STATUS_LABELS[status]
  return (
    <li>
      <Link
        href={`/projects?status=${status}`}
        aria-label={`${label}: ${count} ${count === 1 ? 'project' : 'projects'}, ${percent(count, total)}% of portfolio. View projects.`}
        className={cn(
          'inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors',
          'hover:border-primary/30 hover:bg-sage/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          count === 0 ? 'border-dashed text-muted-foreground' : 'bg-card text-foreground',
        )}
      >
        <span
          className={cn('size-2 shrink-0 rounded-full', PROJECT_STATUS_STYLES[status].className, count === 0 && 'opacity-40')}
          aria-hidden="true"
        />
        <span>{label}</span>
        <span className="tabular font-semibold">{count}</span>
      </Link>
    </li>
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

  return (
    <section aria-labelledby="pipeline-heading" className="surface flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h2 id="pipeline-heading" className="font-serif text-lg font-semibold tracking-tight text-foreground">
          Project Pipeline
        </h2>
        <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
          <Metric label="Total" value={total} />
          <Metric label="In pipeline" value={inPipeline} emphasis />
          <Metric label="Completed" value={completed} />
        </dl>
      </div>

      {total > 0 ? (
        <div
          role="img"
          aria-label={`Portfolio distribution: ${segments
            .map((s) => `${PROJECT_STATUS_LABELS[s]} ${countOf(s)} (${percent(countOf(s), total)}%)`)
            .join(', ')}`}
          className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-sage/70"
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

      <ol className="flex flex-wrap gap-1.5" aria-label="Projects by stage">
        {PROJECT_PIPELINE.map((s) => (
          <StageChip key={s} status={s} count={countOf(s)} total={total} />
        ))}
        {(['on_hold', 'cancelled'] as const).map((s) => (
          <StageChip key={s} status={s} count={s === 'on_hold' ? onHold : cancelled} total={total} />
        ))}
      </ol>
    </section>
  )
}
