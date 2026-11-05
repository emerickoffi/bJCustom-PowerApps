import { GitBranch } from 'lucide-react'
import { ALL_PROJECT_STATUSES, PROJECT_PIPELINE, type ProjectStatus } from '@/lib/domain'
import { cn } from '@/lib/utils'
import { PipelineStageChips } from '@/components/dashboard/pipeline-stage-chips'

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

function PipelineHeading() {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#EFF6FF] text-accent-blue"
        aria-hidden="true"
      >
        <GitBranch className="size-[18px]" />
      </span>
      <h2 id="pipeline-heading" className="font-serif text-lg font-semibold tracking-tight text-foreground">
        Project Pipeline
      </h2>
    </div>
  )
}

/** `counts` is null when the project query failed; that is reported, never shown as zero. */
export function PipelineOverview({ counts }: { counts: Partial<Record<ProjectStatus, number>> | null }) {
  if (!counts)
    return (
      <section aria-labelledby="pipeline-heading" className="surface flex flex-col gap-3 p-5">
        <PipelineHeading />
        <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">Project counts could not be loaded.</p>
      </section>
    )
  const countOf = (s: ProjectStatus) => counts[s] ?? 0
  const total = ALL_PROJECT_STATUSES.reduce((sum, s) => sum + countOf(s), 0)
  const completed = countOf('completed')
  const inPipeline = PROJECT_PIPELINE.filter((s) => s !== 'completed').reduce((sum, s) => sum + countOf(s), 0)
  const onHold = countOf('on_hold')
  const cancelled = countOf('cancelled')

  return (
    <section aria-labelledby="pipeline-heading" className="surface flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <PipelineHeading />
        <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
          <Metric label="Total" value={total} />
          <Metric label="In pipeline" value={inPipeline} emphasis />
          <Metric label="Completed" value={completed} />
        </dl>
      </div>

      <div className="h-px bg-border/80" aria-hidden="true" />

      {total === 0 && <p className="text-sm text-muted-foreground">No projects yet.</p>}

      <PipelineStageChips
        stages={PROJECT_PIPELINE.map((s) => ({ status: s, count: countOf(s) }))}
        statuses={[
          { status: 'on_hold', count: onHold },
          { status: 'cancelled', count: cancelled },
        ]}
        total={total}
      />
    </section>
  )
}
