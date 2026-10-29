import Link from 'next/link'
import { ArrowRight, BellRing, ChevronDown, CircleCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AttentionItem, AttentionPriority } from '@/lib/attention'

const VISIBLE = 3

const PRIORITY: Record<AttentionPriority, { label: string; dot: string; badge: string }> = {
  critical: {
    label: 'Overdue',
    dot: 'bg-destructive',
    badge: 'bg-destructive/8 text-destructive',
  },
  pending: {
    label: 'Action needed',
    dot: 'bg-warning',
    badge: 'bg-champagne-soft text-warning',
  },
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const p = PRIORITY[item.priority]
  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', p.dot)} aria-hidden="true" />
        <div className="flex min-w-0 flex-col gap-1">
          <span className={cn('w-fit rounded-full px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide', p.badge)}>
            {p.label}
          </span>
          <p className="text-pretty text-sm font-semibold leading-snug text-foreground">{item.title}</p>
          {item.project && <p className="text-xs font-medium text-primary">{item.project}</p>}
          {item.description && (
            <p className="line-clamp-2 text-pretty text-xs leading-relaxed text-muted-foreground">{item.description}</p>
          )}
        </div>
      </div>
      <Button
        size="sm"
        variant={item.priority === 'critical' ? 'default' : 'outline'}
        render={<Link href={item.href} />}
        nativeButton={false}
        className="min-h-11 shrink-0 self-start sm:min-h-9 sm:self-center"
      >
        {item.actionLabel}
        <ArrowRight data-icon="inline-end" aria-hidden="true" />
        <span className="sr-only">{`: ${item.title}`}</span>
      </Button>
    </li>
  )
}

export function NotificationsCard({
  items,
  total,
  totalIsLowerBound,
}: {
  items: AttentionItem[]
  total: number
  totalIsLowerBound: boolean
}) {
  const visible = items.slice(0, VISIBLE)
  const rest = items.slice(VISIBLE)
  const countLabel = `${total}${totalIsLowerBound ? '+' : ''}`
  const hasCritical = items.some((i) => i.priority === 'critical')

  return (
    <section
      aria-labelledby="attention-heading"
      className={cn(
        'surface relative flex flex-col gap-5 overflow-hidden p-5 md:p-6',
        total > 0 && 'border-champagne/50 shadow-lift',
      )}
    >
      {total > 0 && (
        <span
          className={cn('absolute inset-x-0 top-0 h-1', hasCritical ? 'bg-destructive/80' : 'bg-champagne')}
          aria-hidden="true"
        />
      )}
      <div className="flex items-start justify-between gap-4 border-b pb-4">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-xl',
              total > 0 ? 'bg-champagne-soft text-champagne-foreground' : 'bg-sage text-primary',
            )}
            aria-hidden="true"
          >
            <BellRing className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 id="attention-heading" className="font-serif text-xl font-semibold tracking-tight text-foreground">
              Needs Your Attention
            </h2>
            {total > 0 && <p className="text-sm text-muted-foreground">Open tasks across your projects</p>}
          </div>
        </div>
        {total > 0 && (
          <span
            className="flex min-w-11 flex-col items-center rounded-xl bg-brand-deep px-3 py-1.5 text-white"
            aria-label={`${countLabel} pending ${total === 1 ? 'item' : 'items'}`}
          >
            <span className="font-serif text-2xl font-semibold leading-none tabular-nums">{countLabel}</span>
            <span className="text-[0.65rem] font-medium uppercase tracking-wide text-champagne" aria-hidden="true">
              Pending
            </span>
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="-mt-1 flex items-start gap-3 rounded-xl bg-sage/60 p-4" role="status">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-sm font-semibold text-foreground">All caught up!</p>
            <p className="text-pretty text-sm text-muted-foreground">No actions require your attention right now.</p>
            <p className="text-pretty text-xs text-muted-foreground">
              {"We'll highlight important tasks here as they arise."}
            </p>
          </div>
        </div>
      ) : (
        <>
          <ul className="flex flex-col divide-y">
            {visible.map((item) => (
              <AttentionRow key={item.key} item={item} />
            ))}
          </ul>
          {rest.length > 0 && (
            <details className="group flex flex-col">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-1.5 rounded-lg border border-dashed text-sm font-medium text-primary transition-colors hover:bg-sage/60 [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">{`View all ${countLabel}`}</span>
                <span className="hidden group-open:inline">Show fewer</span>
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <ul className="mt-4 flex flex-col divide-y border-t pt-4">
                {rest.map((item) => (
                  <AttentionRow key={item.key} item={item} />
                ))}
              </ul>
              {items.length < total && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {`Showing ${items.length} of ${countLabel}. Open each project's schedule or warranty tab for the full list.`}
                </p>
              )}
            </details>
          )}
        </>
      )}
    </section>
  )
}
