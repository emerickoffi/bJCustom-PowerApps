'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'
import { PROJECT_STATUS_STYLES } from '@/components/shared/project-status-banner'
import { cn } from '@/lib/utils'

export type StageCount = { status: ProjectStatus; count: number }

function percent(count: number, total: number) {
  return total ? Math.round((count / total) * 100) : 0
}

function StageChip({ status, count, total }: StageCount & { total: number }) {
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

/** Nonzero chips by default; zero-count stages are revealed on request. On Hold and Cancelled stay a separate status group. */
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
      {shownStages.length > 0 && (
        <ol className="flex flex-wrap gap-1.5" aria-label="Projects by stage">
          {shownStages.map((s) => (
            <StageChip key={s.status} {...s} total={total} />
          ))}
        </ol>
      )}
      {shownStatuses.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className="text-xs font-medium text-muted-foreground" id="pipeline-status-label">
            Status
          </span>
          <ul className="flex flex-wrap gap-1.5" aria-labelledby="pipeline-status-label">
            {shownStatuses.map((s) => (
              <StageChip key={s.status} {...s} total={total} />
            ))}
          </ul>
        </div>
      )}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="inline-flex min-h-9 w-fit items-center gap-1.5 rounded-md px-2 -mx-2 text-sm font-medium text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {showAll ? 'Show fewer' : `Show all stages (${hiddenCount} empty)`}
          <ChevronDown className={cn('size-4 transition-transform', showAll && 'rotate-180')} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
