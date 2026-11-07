import Link from 'next/link'
import { AlertTriangle, ArrowRight, CircleCheck, ClipboardList, Settings2 } from 'lucide-react'
import type { NextAction, NextActionTone } from '@/lib/next-actions'
import { cn } from '@/lib/utils'

const TONE: Record<NextActionTone, { icon: typeof AlertTriangle; className: string; label: string }> = {
  critical: { icon: AlertTriangle, className: 'bg-destructive/10 text-destructive', label: 'Needs attention' },
  review: { icon: ClipboardList, className: 'bg-sage text-primary', label: 'To review' },
  setup: { icon: Settings2, className: 'bg-champagne-soft text-warning', label: 'Setup' },
}

export type WorkScope = 'mine' | 'all'

export function ProjectNextActions({
  items,
  hiddenCount,
  incomplete = false,
  scope,
  scopeTotals,
  scopeHrefs,
}: {
  items: NextAction[]
  hiddenCount: number
  /** Some action sources failed to load, so an empty list must not read as "nothing to do". */
  incomplete?: boolean
  scope: WorkScope
  /** Total actions per scope, including those beyond the display limit. */
  scopeTotals: Record<WorkScope, number>
  scopeHrefs: Record<WorkScope, string>
}) {
  const empty = items.length === 0
  const options: { value: WorkScope; label: string }[] = [
    { value: 'mine', label: 'My work' },
    { value: 'all', label: 'All project work' },
  ]
  return (
    <section aria-labelledby="next-actions-heading" className="surface flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="next-actions-heading" className="font-serif text-lg font-semibold text-foreground">
            Next actions
          </h2>
          {hiddenCount > 0 && <span className="text-xs text-muted-foreground">{`${hiddenCount} more after these`}</span>}
        </div>
        <nav aria-label="Next actions scope" className="flex rounded-lg border border-border bg-[#F8F7F3] p-0.5">
          {options.map((o) => {
            const active = o.value === scope
            return (
              <Link
                key={o.value}
                href={scopeHrefs[o.value]}
                scroll={false}
                replace
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  active ? 'bg-white text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {o.label}
                <span className="tabular-nums text-xs text-muted-foreground">{incomplete ? '—' : scopeTotals[o.value]}</span>
              </Link>
            )
          })}
        </nav>
      </div>
      {empty && !incomplete && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CircleCheck className="size-4 text-primary" aria-hidden="true" />
          {scope === 'mine' ? 'Nothing assigned to you needs action right now' : 'No pending actions'}
        </p>
      )}
      {!empty && (
        <ul className={cn('grid gap-3', items.length === 2 && 'md:grid-cols-2', items.length >= 3 && 'md:grid-cols-2 lg:grid-cols-3')}>
          {items.map((action) => {
            const tone = TONE[action.tone]
            const Icon = tone.icon
            return (
              <li key={action.key}>
                <Link
                  href={action.href}
                  className="group flex h-full min-h-11 flex-col gap-2 rounded-xl border border-[#D6DDE5] bg-white p-3.5 transition-colors hover:border-primary/40 hover:bg-[#F3F4F6] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <div className="flex items-start gap-3">
                    <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', tone.className)}>
                      <Icon className="size-4" aria-hidden="true" />
                      <span className="sr-only">{tone.label}</span>
                    </span>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-medium leading-snug text-foreground">{action.title}</span>
                      <span className="text-xs leading-relaxed text-muted-foreground">{action.description}</span>
                    </div>
                  </div>
                  <span className="mt-auto inline-flex items-center gap-1 pl-11 text-sm font-medium text-primary">
                    {action.actionLabel}
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {incomplete && (
        <p role="status" className="flex items-center gap-2 text-sm text-warning">
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          {empty
            ? 'Pending actions could not be checked. Refresh the page to try again.'
            : 'Some checks could not load, so this list may be incomplete. Refresh the page to try again.'}
        </p>
      )}
    </section>
  )
}
