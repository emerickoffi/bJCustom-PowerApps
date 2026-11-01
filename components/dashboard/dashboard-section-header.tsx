import { cn } from '@/lib/utils'

export function DashboardSectionHeader({
  id,
  title,
  description,
  icon: Icon,
  iconClassName,
  action,
  className,
  compact = false,
}: {
  id: string
  title: string
  description?: React.ReactNode
  icon: React.ComponentType<{ className?: string }>
  iconClassName?: string
  action?: React.ReactNode
  className?: string
  /** Tighter header strip used by tinted card headers. */
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap justify-between gap-x-4',
        compact ? 'items-center gap-y-2' : 'items-start gap-y-3',
        className,
      )}
    >
      <div className={cn('flex min-w-0 gap-3', compact ? 'items-center' : 'items-start')}>
        <span
          className={cn(
            'flex shrink-0 items-center justify-center bg-sage text-primary',
            compact ? 'size-8 rounded-lg' : 'size-10 rounded-xl',
            iconClassName,
          )}
          aria-hidden="true"
        >
          <Icon className={compact ? 'size-[18px]' : 'size-5'} />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2
            id={id}
            className={cn(
              'font-serif text-xl font-semibold tracking-tight text-foreground',
              compact && 'leading-tight',
            )}
          >
            {title}
          </h2>
          {description && (
            <p
              className={cn(
                'text-pretty text-muted-foreground',
                compact ? 'text-[13px] leading-[18px]' : 'text-sm',
              )}
            >
              {description}
            </p>
          )}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2 sm:self-center">{action}</div>}
    </div>
  )
}
