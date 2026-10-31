import { AlertTriangle, Check, Circle, ShieldCheck, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/format'
import { ToneBadge } from '@/components/subcontractors/qualification-badge'
import {
  blockerCount,
  buildVettingStages,
  expiryLabel,
  expiryTier,
  nextRequiredAction,
  progressSummary,
  qualificationBadge,
  readinessLabel,
  vettingStatusOf,
  type QualificationSummary,
  type StageState,
} from '@/lib/subcontractor-qualification'

const STAGE_STYLES: Record<StageState, { dot: string; label: string; line: string }> = {
  complete: { dot: 'bg-emerald-600 text-white', label: 'text-foreground', line: 'bg-emerald-600' },
  current: { dot: 'bg-primary text-primary-foreground ring-4 ring-primary/15', label: 'text-primary', line: 'bg-border' },
  warning: { dot: 'bg-warning text-warning-foreground ring-4 ring-warning/20', label: 'text-warning-foreground', line: 'bg-border' },
  failed: { dot: 'bg-destructive text-white ring-4 ring-destructive/15', label: 'text-destructive', line: 'bg-border' },
  upcoming: { dot: 'border border-border bg-card text-muted-foreground', label: 'text-muted-foreground', line: 'bg-border' },
}

const STATE_TEXT: Record<StageState, string> = {
  complete: 'Completed',
  current: 'Current',
  warning: 'Needs attention',
  failed: 'Failed',
  upcoming: 'Upcoming',
}

function StageIcon({ state }: { state: StageState }) {
  const cls = 'size-3.5'
  if (state === 'complete') return <Check className={cls} aria-hidden="true" />
  if (state === 'warning') return <AlertTriangle className={cls} aria-hidden="true" />
  if (state === 'failed') return <X className={cls} aria-hidden="true" />
  if (state === 'current') return <Circle className="size-2 fill-current" aria-hidden="true" />
  return null
}

export function VettingStepper({ summary }: { summary: QualificationSummary | null }) {
  const stages = buildVettingStages(summary)
  return (
    <ol aria-label="Vetting progress" className="flex flex-col gap-0 sm:flex-row sm:items-start">
      {stages.map((stage, i) => {
        const s = STAGE_STYLES[stage.state]
        const last = i === stages.length - 1
        return (
          <li
            key={stage.key}
            aria-current={stage.state === 'current' || stage.state === 'warning' ? 'step' : undefined}
            className="relative flex gap-3 pb-5 last:pb-0 sm:flex-1 sm:flex-col sm:items-center sm:gap-2 sm:pb-0 sm:text-center"
          >
            {!last && (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-0.5 sm:left-[calc(50%+18px)] sm:top-[13px] sm:h-0.5 sm:w-[calc(100%-36px)]',
                  stage.state === 'complete' ? STAGE_STYLES.complete.line : 'bg-border',
                )}
              />
            )}
            <span className={cn('relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full', s.dot)}>
              <StageIcon state={stage.state} />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5 pt-0.5 sm:pt-0">
              <span className={cn('text-sm font-semibold', s.label)}>{stage.label}</span>
              <span className="text-xs text-muted-foreground">
                <span className="sr-only">{STATE_TEXT[stage.state]}. </span>
                {stage.detail ?? STATE_TEXT[stage.state]}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export function VettingStatusPanel({
  summary,
  today,
  contactCount,
}: {
  summary: QualificationSummary | null
  today: string
  contactCount: number
}) {
  const status = qualificationBadge(summary)
  const readiness = readinessLabel(summary)
  const v = vettingStatusOf(summary)
  const next = nextRequiredAction(summary, today)
  const blockers = summary ? blockerCount(summary) : 0
  const lastUpdated = latest(summary?.decision_at, summary?.last_reviewed_at, summary?.requested_at, summary?.activated_at)
  const expiring = summary?.next_expiration && expiryTier(summary.next_expiration, today) ? summary.next_expiration : null
  const pct = summary?.completion_percent ?? 0

  return (
    <div className="flex flex-col gap-4">
      {v === 'qualified' && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border border-emerald-600/25 bg-emerald-600/5 px-4 py-3 text-sm font-medium text-emerald-800 dark:text-emerald-300"
        >
          <ShieldCheck className="size-5 shrink-0" aria-hidden="true" />
          Ready for work. Every required item is approved and current.
        </p>
      )}

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-4">
        <Fact label="Current status">
          <ToneBadge label={status.label} tone={status.tone} />
        </Fact>
        <Fact label="Readiness">
          <ToneBadge label={readiness.label} tone={readiness.tone} />
        </Fact>
        <Fact label="Progress">
          <span className="tabular-nums">{summary ? progressSummary(summary) : 'No checklist yet'}</span>
        </Fact>
        <Fact label="Last updated">{lastUpdated ? formatDateTime(lastUpdated) : 'Not yet'}</Fact>
      </dl>

      <div className="flex flex-col gap-2">
        <div
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Required items approved"
        >
          <div
            className={cn('h-full rounded-full transition-[width]', v === 'qualified' ? 'bg-emerald-600' : 'bg-primary')}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span className="tabular-nums text-muted-foreground">{pct}% complete</span>
          {blockers > 0 && v !== 'new' && v !== 'requested' && (
            <span className="font-medium text-warning-foreground">
              {blockers} {blockers === 1 ? 'blocker' : 'blockers'}
            </span>
          )}
          {expiring && (
            <span className={cn('font-medium', expiryTier(expiring, today) === 'expired' ? 'text-destructive' : 'text-warning-foreground')}>
              Next document {expiryLabel(expiring, today).toLowerCase()}
            </span>
          )}
          {contactCount === 0 && <span className="font-medium text-warning-foreground">No contact person assigned</span>}
        </div>
      </div>

      {(next || (summary?.decision_notes && (v === 'conditional' || v === 'not_qualified'))) && (
        <div className="flex flex-col gap-1 rounded-lg bg-muted/60 px-4 py-3">
          {next && (
            <p className="text-sm">
              <span className="font-semibold text-foreground">Next required action: </span>
              <span className="text-foreground/80">{next}</span>
            </p>
          )}
          {summary?.decision_notes && (v === 'conditional' || v === 'not_qualified') && (
            <p className="text-xs text-muted-foreground">
              {v === 'conditional' ? 'Conditions: ' : 'Reason: '}
              {summary.decision_notes}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm font-medium text-foreground">{children}</dd>
    </div>
  )
}

function latest(...dates: (string | null | undefined)[]): string | null {
  const valid = dates.filter((d): d is string => Boolean(d))
  if (!valid.length) return null
  return valid.reduce((a, b) => (new Date(a) > new Date(b) ? a : b))
}
