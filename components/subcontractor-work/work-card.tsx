import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { WorkState } from '@/lib/subcontractor-work'
import { WorkStateBadge } from '@/components/subcontractor-work/work-state-badge'

export function WorkCard({
  href,
  title,
  project,
  meta,
  state,
  overdue,
}: {
  href: string
  title: string
  project: string
  meta?: string
  state: WorkState
  overdue?: boolean
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-16 items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-sage/30"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate font-medium text-foreground">{title}</span>
          <span className="truncate text-xs text-muted-foreground">
            {project}
            {meta ? ` · ${meta}` : ''}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <WorkStateBadge state={state} />
            {overdue && <span className="text-xs font-medium text-destructive">Overdue</span>}
          </div>
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  )
}
