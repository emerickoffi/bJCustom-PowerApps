import { Eye, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

type Audience = 'homeowner' | 'internal'

const AUDIENCE = {
  homeowner: { icon: Eye, label: 'Homeowner-visible', chip: 'bg-sage text-primary ring-primary/15', band: 'bg-sage/50' },
  internal: { icon: Lock, label: 'Internal only', chip: 'bg-muted text-muted-foreground ring-border', band: 'bg-muted/50' },
} as const

/** Card with a labelled band that states who can see its contents. */
export function ChangeOrderSection({
  id,
  audience,
  title,
  description,
  actions,
  flush,
  className,
  children,
}: {
  id: string
  audience: Audience
  title: string
  description?: string
  actions?: React.ReactNode
  /** Removes body padding, e.g. for edge-to-edge tables. */
  flush?: boolean
  className?: string
  children: React.ReactNode
}) {
  const a = AUDIENCE[audience]
  const Icon = a.icon
  return (
    <section aria-labelledby={id} className={cn('overflow-hidden rounded-xl border border-border/80 bg-card shadow-xs', className)}>
      <header className={cn('flex flex-col gap-3 border-b border-border/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6', a.band)}>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={id} className="text-sm font-semibold text-foreground">
              {title}
            </h2>
            <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem] font-medium ring-1 ring-inset', a.chip)}>
              <Icon className="size-3" aria-hidden="true" />
              {a.label}
            </span>
          </div>
          {description && <p className="text-pretty text-xs leading-relaxed text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <div className={flush ? undefined : 'p-5 md:p-6'}>{children}</div>
    </section>
  )
}
