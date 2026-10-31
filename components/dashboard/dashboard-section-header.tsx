import { cn } from '@/lib/utils'

export function DashboardSectionHeader({
  id,
  title,
  description,
  icon: Icon,
  iconClassName,
  action,
  className,
}: {
  id: string
  title: string
  description?: React.ReactNode
  icon: React.ComponentType<{ className?: string }>
  iconClassName?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-x-4 gap-y-3', className)}>
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl bg-sage text-primary', iconClassName)}
          aria-hidden="true"
        >
          <Icon className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={id} className="font-serif text-xl font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          {description && <p className="text-pretty text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2 sm:self-center">{action}</div>}
    </div>
  )
}
