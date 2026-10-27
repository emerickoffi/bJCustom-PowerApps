import Link from 'next/link'
import { PROJECT_PIPELINE, PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'
import { cn } from '@/lib/utils'

export function PipelineOverview({ counts }: { counts: Partial<Record<ProjectStatus, number>> }) {
  const max = Math.max(1, ...PROJECT_PIPELINE.map((s) => counts[s] ?? 0))
  const total = PROJECT_PIPELINE.reduce((sum, s) => sum + (counts[s] ?? 0), 0)
  const onHold = counts.on_hold ?? 0
  const cancelled = counts.cancelled ?? 0

  return (
    <section aria-labelledby="pipeline-heading" className="surface flex flex-col gap-6 p-5 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="pipeline-heading" className="font-serif text-xl font-semibold tracking-tight text-foreground">
            Project pipeline
          </h2>
          <p className="text-sm text-muted-foreground">{`${total} homes from first call to handover`}</p>
        </div>
        <div className="flex gap-2 text-xs">
          <Link
            href="/projects?status=on_hold"
            className="rounded-full bg-champagne-soft px-2.5 py-1 font-medium text-warning transition-colors hover:bg-champagne/20"
          >
            {`${onHold} on hold`}
          </Link>
          <Link
            href="/projects?status=cancelled"
            className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground transition-colors hover:bg-muted/70"
          >
            {`${cancelled} cancelled`}
          </Link>
        </div>
      </div>
      <ol className="flex flex-col gap-1">
        {PROJECT_PIPELINE.map((status, index) => {
          const count = counts[status] ?? 0
          return (
            <li key={status}>
              <Link
                href={`/projects?status=${status}`}
                className="group grid grid-cols-[1.5rem_minmax(0,11rem)_1fr_2rem] items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-sage/50"
              >
                <span className="tabular text-xs text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
                <span className={cn('truncate text-sm', count ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                  {PROJECT_STATUS_LABELS[status]}
                </span>
                <span className="h-2 overflow-hidden rounded-full bg-sage/70" aria-hidden="true">
                  <span
                    className={cn(
                      'block h-full rounded-full transition-[width] duration-700',
                      status === 'under_construction' ? 'bg-primary' : 'bg-primary/55 group-hover:bg-primary/75',
                    )}
                    style={{ width: `${count ? Math.max(6, (count / max) * 100) : 0}%` }}
                  />
                </span>
                <span className="tabular text-right text-sm font-semibold text-foreground">{count}</span>
              </Link>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
