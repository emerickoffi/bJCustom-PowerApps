import { cn } from '@/lib/utils'

type Tone = 'forest' | 'bronze'

const TONES: Record<Tone, string> = {
  forest: 'bg-sage text-primary ring-primary/10',
  bronze: 'bg-[#FFF2DA] text-[#96570E] ring-[#96570E]/12',
}

/** Shared card heading: 36px icon tile, serif title, optional subtitle and right-aligned action, divider beneath. */
export function CardSectionHeader({
  id,
  title,
  subtitle,
  icon: Icon,
  tone = 'forest',
  action,
  className,
}: {
  id: string
  title: string
  subtitle?: React.ReactNode
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
  tone?: Tone
  action?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-border/60 pb-4', className)}>
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset', TONES[tone])}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col">
          <h2 id={id} className="font-serif text-lg font-semibold leading-tight tracking-tight text-foreground">
            {title}
          </h2>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  )
}
