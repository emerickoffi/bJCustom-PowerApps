import Link from 'next/link'
import { ArrowRight, CircleAlert, CircleCheck, CircleDashed, CircleMinus, ClipboardCheck, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  READINESS_POLICY_LABELS,
  READINESS_STATE_LABELS,
  type ReadinessItem,
  type ReadinessState,
  type ReadinessSummary,
} from '@/lib/completion-readiness'

const STATE_STYLE: Record<ReadinessState, { icon: typeof CircleCheck; className: string }> = {
  verified: { icon: CircleCheck, className: 'text-primary' },
  exception_approved: { icon: ShieldCheck, className: 'text-primary' },
  incomplete: { icon: CircleAlert, className: 'text-warning' },
  needs_evidence: { icon: CircleDashed, className: 'text-warning' },
  not_applicable: { icon: CircleMinus, className: 'text-muted-foreground' },
}

const OVERALL = {
  ready: { label: 'Ready to complete', className: 'bg-primary/10 text-primary' },
  needs_exceptions: { label: 'Needs approved exceptions', className: 'bg-champagne-soft text-warning' },
  blocked: { label: 'Blocked', className: 'bg-destructive/10 text-destructive' },
} as const

export function ReadinessChecklist({ items }: { items: ReadinessItem[] }) {
  return (
    <ul className="grid gap-x-6 gap-y-1 md:grid-cols-2">
      {items.map((item) => {
        const style = STATE_STYLE[item.state]
        const Icon = style.icon
        const body = (
          <>
            <Icon className={cn('mt-0.5 size-4 shrink-0', style.className)} aria-hidden="true" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm font-medium text-foreground">{item.label}</span>
                <span className={cn('text-xs font-medium', style.className)}>{READINESS_STATE_LABELS[item.state]}</span>
              </span>
              <span className="text-xs leading-relaxed text-muted-foreground">{item.detail}</span>
              {item.policy !== 'not_applicable' && (
                <span className="text-[0.7rem] uppercase tracking-wider text-muted-foreground/80">{READINESS_POLICY_LABELS[item.policy]}</span>
              )}
            </span>
          </>
        )
        return (
          <li key={item.key} className="border-b border-border/60 last:border-b-0 md:[&:nth-last-child(2):nth-child(odd)]:border-b-0">
            {item.href ? (
              <Link href={item.href} className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring">
                {body}
              </Link>
            ) : (
              <div className="flex items-start gap-3 py-2.5">{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function ReadinessCounts({ summary }: { summary: ReadinessSummary }) {
  const overall = OVERALL[summary.overall]
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', overall.className)}>{overall.label}</span>
      <span className="text-muted-foreground">
        <span className="font-semibold text-foreground">{`${summary.satisfiedCount}/${summary.applicableCount}`}</span> satisfied
      </span>
      <span className="text-muted-foreground">
        <span className="font-semibold text-foreground">{summary.blockers.length}</span>{' '}
        {summary.blockers.length === 1 ? 'blocker' : 'blockers'}
      </span>
      <span className="text-muted-foreground">
        <span className="font-semibold text-foreground">{summary.warnings.length}</span>{' '}
        {summary.warnings.length === 1 ? 'warning' : 'warnings'}
      </span>
    </div>
  )
}

export function CompletionReadinessPanel({
  summary,
  projectId,
  canReview,
}: {
  summary: ReadinessSummary
  projectId: string
  canReview: boolean
}) {
  return (
    <section aria-labelledby="readiness-heading" className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <h2 id="readiness-heading" className="flex items-center gap-2 font-serif text-lg font-semibold text-foreground">
            <ClipboardCheck className="size-4.5 text-primary" aria-hidden="true" />
            Completion readiness
          </h2>
          <ReadinessCounts summary={summary} />
        </div>
        {canReview && (
          <Button size="sm" render={<Link href={`/projects/${projectId}/complete`} />} nativeButton={false} className="sm:shrink-0">
            Review completion
            <ArrowRight data-icon="inline-end" />
          </Button>
        )}
      </div>
      {summary.nextAction && (
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-foreground">
          <span className="font-medium">Next: </span>
          {summary.nextAction.href ? (
            <Link href={summary.nextAction.href} className="underline-offset-4 hover:underline">
              {`${summary.nextAction.label} — ${summary.nextAction.detail}`}
            </Link>
          ) : (
            `${summary.nextAction.label} — ${summary.nextAction.detail}`
          )}
        </p>
      )}
      <ReadinessChecklist items={summary.items} />
    </section>
  )
}
