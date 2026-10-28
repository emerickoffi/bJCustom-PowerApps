import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function OverviewSection({
  id,
  icon: Icon,
  title,
  subtitle,
  meta,
  actions,
  children,
  className,
}: {
  id: string
  icon: LucideIcon
  title: string
  subtitle?: string
  meta?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section aria-labelledby={id} className={cn('surface flex flex-col gap-5 p-5 md:p-6', className)}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sage text-primary">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <h2 id={id} className="scroll-mt-28 font-serif text-lg font-semibold leading-snug tracking-tight text-foreground">
                {title}
              </h2>
              {meta}
            </div>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">{actions}</div>}
      </header>
      {children}
    </section>
  )
}

export function OverviewNotice({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed bg-[#F8F7F3] p-4">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  )
}
