import { cn } from '@/lib/utils'

type Tone = 'forest' | 'link' | 'teal'

const TONES: Record<Tone, string> = {
  forest: 'bg-sage text-primary ring-1 ring-inset ring-primary/10',
  link: 'bg-link-soft text-link ring-1 ring-inset ring-link-border',
  teal: 'bg-[#E5F5F7] text-[#007F95]',
}

const SIZES = {
  md: { tile: 'size-9 rounded-lg', icon: 'size-5' },
  lg: { tile: 'size-10 rounded-xl', icon: 'size-[22px]' },
} as const

type IconComponent = React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>

/** Decorative heading icon tile shared by card headers. */
export function CardSectionIcon({
  icon: Icon,
  tone = 'forest',
  size = 'md',
  className,
}: {
  icon: IconComponent
  tone?: Tone
  size?: keyof typeof SIZES
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn('flex shrink-0 items-center justify-center', SIZES[size].tile, TONES[tone], className)}
    >
      <Icon className={SIZES[size].icon} aria-hidden="true" />
    </span>
  )
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
  icon: IconComponent
  tone?: Tone
  action?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-border/60 pb-4', className)}>
      <div className="flex min-w-0 items-center gap-3">
        <CardSectionIcon icon={Icon} tone={tone} />
        <div className="flex min-w-0 flex-col">
          <h2 id={id} className="type-section-title text-foreground">
            {title}
          </h2>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  )
}
