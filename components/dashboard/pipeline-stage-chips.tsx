'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'
import { stageIndicatorColor } from '@/lib/stage-colors'
import { cn } from '@/lib/utils'

export type StageCount = { status: ProjectStatus; count: number }

/** Share of all projects in this pipeline. Statuses are mutually exclusive, so shares partition `total`. */
export function shareOfProjects(count: number, total: number) {
  return total > 0 ? (count / total) * 100 : 0
}

/** Stage name | count | proportional bar | whole-number share of projects. Zero count means zero fill. */
function StageRow({ status, count, total }: StageCount & { total: number }) {
  const label = PROJECT_STATUS_LABELS[status]
  const share = shareOfProjects(count, total)
  const rounded = Math.round(share)
  return (
    <li>
      <Link
        href={`/projects?status=${status}`}
        aria-label={`${label}: ${count} ${count === 1 ? 'project' : 'projects'}, ${rounded}% of projects. View projects.`}
        className="group -mx-2 grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-md px-2 py-1.5 transition-colors hover:bg-[#E5F5F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(8rem,12rem)_2.5rem_minmax(0,1fr)_3rem] sm:gap-y-0"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            data-stage={status}
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: stageIndicatorColor(status) }}
          />
          <span className="truncate text-sm font-medium text-foreground">{label}</span>
        </span>
        <span
          aria-hidden="true"
          className={cn('tabular text-right text-sm font-semibold', count === 0 ? 'text-muted-foreground' : 'text-foreground')}
        >
          {count}
        </span>
        <span aria-hidden="true" className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <span
            data-stage={status}
            className="block h-full rounded-full"
            style={{ width: `${share}%`, backgroundColor: stageIndicatorColor(status) }}
          />
        </span>
        <span aria-hidden="true" className="tabular text-right text-xs font-medium text-muted-foreground">
          {`${rounded}%`}
        </span>
      </Link>
    </li>
  )
}

function StageRows({ items, total, label, labelledBy }: { items: StageCount[]; total: number; label?: string; labelledBy?: string }) {
  return (
    <ol aria-label={label} aria-labelledby={labelledBy} className="flex flex-col gap-0.5">
      {items.map((s) => (
        <StageRow key={s.status} {...s} total={total} />
      ))}
    </ol>
  )
}

/**
 * Nonzero stages by default; zero-count stages are revealed on request. On Hold and Cancelled stay a separate status
 * group. Every share uses the same `total`, so collapsing or expanding never changes a bar or percentage.
 */
export function PipelineStageChips({
  stages,
  statuses,
  total,
}: {
  stages: StageCount[]
  statuses: StageCount[]
  total: number
}) {
  const [showAll, setShowAll] = useState(false)
  const hiddenCount = [...stages, ...statuses].filter((s) => s.count === 0).length
  const visible = (list: StageCount[]) => (showAll ? list : list.filter((s) => s.count > 0))
  const shownStages = visible(stages)
  const shownStatuses = visible(statuses)

  return (
    <div className="flex flex-col gap-3">
      {(shownStages.length > 0 || shownStatuses.length > 0) && (
        <p className="text-xs text-muted-foreground">{`Percent of all ${total} ${total === 1 ? 'project' : 'projects'}, not construction progress.`}</p>
      )}
      {shownStages.length > 0 && <StageRows items={shownStages} total={total} label="Projects by stage" />}
      {shownStatuses.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-[#D6DDE5] pt-3">
          <span className="text-xs font-medium text-muted-foreground" id="pipeline-status-label">
            Status
          </span>
          <StageRows items={shownStatuses} total={total} labelledBy="pipeline-status-label" />
        </div>
      )}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="inline-flex min-h-9 w-fit items-center gap-1.5 rounded-md px-2 -mx-2 text-sm font-medium text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {showAll ? 'Show fewer' : 'Show all stages'}
          <ChevronDown className={cn('size-4 transition-transform', showAll && 'rotate-180')} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
