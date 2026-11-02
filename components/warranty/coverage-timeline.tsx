import { formatDate } from '@/lib/format'
import { SemanticBadge, type SemanticTone } from '@/components/shared/semantic-badge'
import { CoverageIconTile, coverageAccent } from '@/components/warranty/coverage-accent'
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

/** Rows render edge-to-edge; the parent card supplies the surface, header, and rounded corners. */
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
    return <p className="px-5 py-4 text-sm text-muted-foreground md:px-6">No coverage periods are scheduled for this warranty.</p>
  }

  return (
    <ol className="flex flex-col divide-y divide-[#E2E8E2]" aria-label="Coverage periods">
      {milestones.map((m) => {
        const { state, daysRemaining } = coverageState(m, todayIso)
        const progress = coverageProgress(startDate, m.due_on, todayIso)
        const percent = Math.round(progress * 100)
        const claims = openClaimsByCoverage[m.coverage_key] ?? 0
        const { color } = coverageAccent(m.coverage_key)
        return (
          <li
            key={m.id}
            className="flex flex-col gap-3 border-l-[3px] py-4 pl-[calc(1.25rem-3px)] pr-5 md:grid md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_auto] md:items-center md:gap-6 md:pl-[calc(1.5rem-3px)] md:pr-6"
            style={{ borderLeftColor: color }}
          >
            <div className="flex min-w-0 items-start gap-3">
              <CoverageIconTile coverageKey={m.coverage_key} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <h3 className="font-medium leading-snug text-foreground">{m.coverage_name}</h3>
                {m.categories.length > 0 && (
                  <p className="text-pretty text-xs leading-relaxed text-muted-foreground">{m.categories.join(', ')}</p>
                )}
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex justify-between gap-2 text-xs tabular-nums text-muted-foreground">
                <span>Time elapsed</span>
                <span className="font-medium text-foreground">{percent}%</span>
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-[#E9EDF2]"
                role="progressbar"
                aria-label={`${m.coverage_name} time elapsed`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
              >
                <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, backgroundColor: color }} />
              </div>
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-xs tabular-nums text-muted-foreground">
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
