import { cn } from '@/lib/utils'
import {
  CLIENT_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  type ClientStatus,
  type ProjectStatus,
} from '@/lib/domain'

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

const PROJECT_TONE: Record<ProjectStatus, Tone> = {
  lead: 'neutral',
  consultation: 'neutral',
  planning: 'sage',
  estimating: 'sage',
  awaiting_approval: 'warning',
  preconstruction: 'sage',
  under_construction: 'solid',
  final_inspection: 'primary',
  punch_list: 'primary',
  substantially_complete: 'primary',
  completed: 'champagne',
  on_hold: 'warning',
  cancelled: 'danger',
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

export function ProjectStatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  return (
    <StatusPill tone={PROJECT_TONE[status]} className={className}>
      {PROJECT_STATUS_LABELS[status]}
    </StatusPill>
  )
}

export function ClientStatusBadge({ status, className }: { status: ClientStatus; className?: string }) {
  return (
    <StatusPill tone={CLIENT_TONE[status]} className={cn(status === 'archived' && 'line-through', className)}>
      {CLIENT_STATUS_LABELS[status]}
    </StatusPill>
  )
}

export type { Tone as StatusTone }
