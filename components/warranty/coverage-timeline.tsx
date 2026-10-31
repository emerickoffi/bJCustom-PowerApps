import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { SemanticBadge, type SemanticTone } from '@/components/shared/semantic-badge'
import {
  COVERAGE_STATE_LABELS,
  coverageProgress,
  coverageState,
  type CoverageState,
} from '@/lib/warranty-coverage'

export type TimelineMilestone = {
  id: string
  coverage_key: string
  coverage_name: string
  categories: string[]
  due_on: string
  reached_at: string | null
}

const STATE_TONE: Record<CoverageState, SemanticTone> = {
  active: 'success',
  expiring_soon: 'pending',
  expired: 'neutral',
  not_applicable: 'neutral',
  unavailable: 'danger',
}

const BAR_TONE: Record<CoverageState, string> = {
  active: 'bg-[#187542]',
  expiring_soon: 'bg-[#C27A1A]',
  expired: 'bg-[#526174]/50',
  not_applicable: 'bg-muted',
  unavailable: 'bg-[#BD302B]/60',
}

export function CoverageTimeline({
  startDate,
  milestones,
  todayIso,
  openClaimsByCoverage,
}: {
  startDate: string
  milestones: TimelineMilestone[]
  todayIso: string
  openClaimsByCoverage: Record<string, number>
}) {
  if (milestones.length === 0) {
    return <p className="surface p-5 text-sm text-muted-foreground">No coverage periods are scheduled for this warranty.</p>
  }

  return (
    <ol className="surface flex flex-col divide-y divide-[#E2E8E2]" aria-label="Coverage periods">
      {milestones.map((m) => {
        const { state, daysRemaining } = coverageState(m, todayIso)
        const progress = coverageProgress(startDate, m.due_on, todayIso)
        const claims = openClaimsByCoverage[m.coverage_key] ?? 0
        return (
          <li key={m.id} className="flex flex-col gap-3 p-4 md:grid md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] md:items-center md:gap-6 md:px-5">
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="font-medium text-foreground">{m.coverage_name}</h3>
              {m.categories.length > 0 && (
                <p className="truncate text-xs text-muted-foreground" title={m.categories.join(', ')}>
                  {m.categories.join(' · ')}
                </p>
              )}
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-[#E9EDF2]"
                role="progressbar"
                aria-label={`${m.coverage_name} elapsed`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress * 100)}
              >
                <div className={cn('h-full rounded-full', BAR_TONE[state])} style={{ width: `${Math.max(progress * 100, 2)}%` }} />
              </div>
              <div className="flex justify-between gap-2 text-xs tabular-nums text-muted-foreground">
                <span>Start {formatDate(startDate)}</span>
                <span>End {formatDate(m.due_on)}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 md:flex-col md:items-end md:gap-1">
              <SemanticBadge tone={STATE_TONE[state]}>{COVERAGE_STATE_LABELS[state]}</SemanticBadge>
              <span className="text-xs tabular-nums text-muted-foreground">
                {daysRemaining !== null ? `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left` : 'Period ended'}
                {claims > 0 && ` · ${claims} open claim${claims === 1 ? '' : 's'}`}
              </span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
