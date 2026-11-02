'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'
import { stageIndicatorColor } from '@/lib/stage-colors'
import { cn } from '@/lib/utils'

export type StageCount = { status: ProjectStatus; count: number }

function percent(count: number, total: number) {
  return total ? Math.round((count / total) * 100) : 0
}

/** Stage name, count, and an equal-length colour accent bar (not a completion measure). */
function StageSummary({ status, count, total }: StageCount & { total: number }) {
  const label = PROJECT_STATUS_LABELS[status]
  return (
    <li className="min-w-0 border-l border-border/70 px-4">
      <Link
        href={`/projects?status=${status}`}
        aria-label={`${label}: ${count} ${count === 1 ? 'project' : 'projects'}, ${percent(count, total)}% of portfolio. View projects.`}
        className="group -mx-2 flex min-h-11 flex-col gap-1.5 rounded-md px-2 py-1.5 transition-colors hover:bg-sage/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="truncate text-xs font-medium text-muted-foreground group-hover:text-foreground">{label}</span>
        <span
          className={cn(
            'tabular font-serif text-2xl font-semibold leading-none',
            count === 0 ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          {count}
        </span>
        <span
          aria-hidden="true"
          data-stage={status}
          className={cn('mt-1 h-1 w-full rounded-full', count === 0 && 'opacity-35')}
          style={{ backgroundColor: stageIndicatorColor(status) }}
        />
      </Link>
    </li>
  )
}

/** Separators are left borders; the -ml-px inside an overflow-hidden wrapper hides the one starting each row. */
function SummaryGrid({ items, total, label, labelledBy }: { items: StageCount[]; total: number; label?: string; labelledBy?: string }) {
  return (
    <div className="overflow-hidden">
      <ol
        aria-label={label}
        aria-labelledby={labelledBy}
        className="-ml-px grid grid-cols-1 gap-y-4 min-[22rem]:grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]"
      >
        {items.map((s) => (
          <StageSummary key={s.status} {...s} total={total} />
        ))}
      </ol>
    </div>
  )
}

/** Nonzero stages by default; zero-count stages are revealed on request. On Hold and Cancelled stay a separate status group. */
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
    <div className="flex flex-col gap-4">
      {shownStages.length > 0 && <SummaryGrid items={shownStages} total={total} label="Projects by stage" />}
      {shownStatuses.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border/70 pt-4">
          <span className="text-xs font-medium text-muted-foreground" id="pipeline-status-label">
            Status
          </span>
          <SummaryGrid items={shownStatuses} total={total} labelledBy="pipeline-status-label" />
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
