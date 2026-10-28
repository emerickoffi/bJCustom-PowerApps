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
  variant = 'default',
}: {
  id: string
  icon: LucideIcon
  title: string
  subtitle?: string
  meta?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  /** `identity` gives the section a soft-sage header band; reserve it for the page's primary card. */
  variant?: 'default' | 'identity'
}) {
  const identity = variant === 'identity'
  return (
    <section
      aria-labelledby={id}
      className={cn('surface flex flex-col', identity ? 'overflow-hidden p-0' : 'gap-5 p-5 md:p-6', className)}
    >
      <header
        className={cn(
          'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
          identity && 'border-b border-[#E2E8E2] bg-[#EAF0E9] px-5 py-5 md:px-6',
        )}
      >
        <div className={cn('flex min-w-0 gap-3', identity ? 'items-center gap-4' : 'items-start')}>
          <span
            className={cn(
              'flex shrink-0 items-center justify-center text-primary',
              identity ? 'size-11 rounded-xl bg-white ring-1 ring-inset ring-primary/12' : 'size-9 rounded-lg bg-sage',
            )}
          >
            <Icon className={identity ? 'size-5' : 'size-4'} aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <h2
                id={id}
                className={cn(
                  'scroll-mt-36 font-serif font-semibold leading-snug tracking-tight text-foreground',
                  identity ? 'text-xl md:text-2xl' : 'text-lg',
                )}
              >
                {title}
              </h2>
              {meta}
            </div>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">{actions}</div>}
      </header>
      {identity ? <div className="flex flex-col gap-5 p-5 md:p-6">{children}</div> : children}
    </section>
  )
}

export function OverviewNotice({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed bg-[#F8F7F3] p-4">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-muted-foreground ring-1 ring-inset ring-border">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  )
}
