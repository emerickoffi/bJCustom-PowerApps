'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { PROJECT_PIPELINE, PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'
import { PROJECT_STATUS_STYLES } from '@/components/shared/project-status-banner'
import { cn } from '@/lib/utils'

const OFF_PIPELINE = ['on_hold', 'cancelled'] as const

function percent(count: number, total: number) {
  return total ? Math.round((count / total) * 100) : 0
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

export function PipelineStageChips({
  counts,
  total,
}: {
  counts: Partial<Record<ProjectStatus, number>>
  total: number
}) {
  const [showAll, setShowAll] = useState(false)
  const listId = useId()
  const countOf = (s: ProjectStatus) => counts[s] ?? 0
  const keep = (s: ProjectStatus) => showAll || countOf(s) > 0
  const sequential = PROJECT_PIPELINE.filter(keep)
  const offPipeline = OFF_PIPELINE.filter(keep)
  const hiddenCount = [...PROJECT_PIPELINE, ...OFF_PIPELINE].filter((s) => countOf(s) === 0).length

  return (
    <div className="flex flex-col gap-2">
      {sequential.length + offPipeline.length > 0 && (
        <div id={listId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {sequential.length > 0 && (
            <ol className="flex flex-wrap gap-1.5" aria-label="Projects by stage">
              {sequential.map((s) => (
                <StageChip key={s} status={s} count={countOf(s)} total={total} />
              ))}
            </ol>
          )}
          {offPipeline.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 border-l pl-3" aria-label="Projects not in sequence">
              {offPipeline.map((s) => (
                <StageChip key={s} status={s} count={countOf(s)} total={total} />
              ))}
            </ul>
          )}
        </div>
      )}
      {hiddenCount > 0 && (
        <button
          type="button"
          aria-expanded={showAll}
          aria-controls={listId}
          onClick={() => setShowAll((v) => !v)}
          className="self-start rounded-md px-1 text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-8"
        >
          {showAll ? 'Show fewer' : `Show all stages (${hiddenCount} empty)`}
        </button>
      )}
    </div>
  )
}
