import Link from 'next/link'
import { AlertTriangle, ArrowRight, ClipboardList, Settings2 } from 'lucide-react'
import type { NextAction, NextActionTone } from '@/lib/next-actions'
import { cn } from '@/lib/utils'

const TONE: Record<NextActionTone, { icon: typeof AlertTriangle; className: string; label: string }> = {
  critical: { icon: AlertTriangle, className: 'bg-destructive/10 text-destructive', label: 'Needs attention' },
  review: { icon: ClipboardList, className: 'bg-sage text-primary', label: 'To review' },
  setup: { icon: Settings2, className: 'bg-champagne-soft text-warning', label: 'Setup' },
}

export function ProjectNextActions({ items, hiddenCount }: { items: NextAction[]; hiddenCount: number }) {
  if (items.length === 0) return null
  return (
    <section aria-labelledby="next-actions-heading" className="surface flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="next-actions-heading" className="font-serif text-lg font-semibold text-foreground">
          Next actions
        </h2>
        {hiddenCount > 0 && (
          <span className="text-xs text-muted-foreground">{`${hiddenCount} more after these`}</span>
        )}
      </div>
      <ul className="grid gap-3 md:grid-cols-3">
        {items.map((action) => {
          const tone = TONE[action.tone]
          const Icon = tone.icon
          return (
            <li key={action.key}>
              <Link
                href={action.href}
                className="group flex h-full min-h-11 flex-col gap-3 rounded-xl border border-[#E2E8E2] bg-white p-4 transition-colors hover:border-primary/40 hover:bg-[#F8F7F3] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <div className="flex items-start gap-3">
                  <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', tone.className)}>
                    <Icon className="size-4" aria-hidden="true" />
                    <span className="sr-only">{tone.label}</span>
                  </span>
                  <div className="flex min-w-0 flex-col gap-1">
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
    </section>
  )
}
