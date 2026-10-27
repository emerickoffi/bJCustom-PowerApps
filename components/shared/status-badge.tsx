import { cn } from '@/lib/utils'
import { CLIENT_STATUS_LABELS, type ClientStatus, type ProjectStatus } from '@/lib/domain'
import { ProjectStatusBanner } from '@/components/shared/project-status-banner'

type Tone = 'neutral' | 'sage' | 'primary' | 'solid' | 'warning' | 'danger' | 'champagne'

const TONE: Record<Tone, { pill: string; dot: string }> = {
  neutral: { pill: 'bg-muted text-muted-foreground ring-border', dot: 'bg-muted-foreground/60' },
  sage: { pill: 'bg-sage text-primary ring-primary/10', dot: 'bg-primary/60' },
  primary: { pill: 'bg-primary/10 text-primary ring-primary/15', dot: 'bg-primary' },
  solid: { pill: 'bg-primary text-primary-foreground ring-primary', dot: 'bg-champagne' },
  warning: { pill: 'bg-champagne-soft text-warning ring-warning/15', dot: 'bg-warning' },
  danger: { pill: 'bg-destructive/8 text-destructive ring-destructive/15', dot: 'bg-destructive' },
  champagne: { pill: 'bg-champagne-soft text-champagne-foreground ring-champagne/25', dot: 'bg-champagne' },
}

const CLIENT_TONE: Record<ClientStatus, Tone> = {
  lead: 'champagne',
  active: 'primary',
  inactive: 'neutral',
  archived: 'neutral',
}

export function StatusPill({
  tone,
  children,
  className,
}: {
  tone: Tone
  children: React.ReactNode
  className?: string
}) {
  const t = TONE[tone]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        t.pill,
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', t.dot)} aria-hidden="true" />
      {children}
    </span>
  )
}

/** Compact project status used in tables and small references; shares colors with ProjectStatusBanner. */
export function ProjectStatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  return <ProjectStatusBanner status={status} compact className={className} />
}

export function ClientStatusBadge({ status, className }: { status: ClientStatus; className?: string }) {
  return (
    <StatusPill tone={CLIENT_TONE[status]} className={cn(status === 'archived' && 'line-through', className)}>
      {CLIENT_STATUS_LABELS[status]}
    </StatusPill>
  )
}

export type { Tone as StatusTone }
