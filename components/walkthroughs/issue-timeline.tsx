import { CalendarClock, Camera, CheckCircle2, CircleDot, Flag, Hammer, MessageSquare, ShieldCheck, UserRound, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate, formatDateTime } from '@/lib/format'
import { ISSUE_STATUS_LABELS, PRIORITY_LABELS, type IssueEvent, type IssueEventType, type IssuePriority, type IssueStatus } from '@/lib/walkthroughs'

const ICONS: Record<IssueEventType, { icon: LucideIcon; tone: string }> = {
  reported: { icon: Flag, tone: 'bg-warning/15 text-warning-foreground' },
  status_changed: { icon: CircleDot, tone: 'bg-accent text-accent-foreground' },
  assigned: { icon: UserRound, tone: 'bg-secondary text-secondary-foreground' },
  repair_recorded: { icon: Hammer, tone: 'bg-secondary text-secondary-foreground' },
  priority_changed: { icon: Flag, tone: 'bg-secondary text-secondary-foreground' },
  due_date_changed: { icon: CalendarClock, tone: 'bg-secondary text-secondary-foreground' },
  builder_approved: { icon: ShieldCheck, tone: 'bg-primary/15 text-primary' },
  homeowner_accepted: { icon: CheckCircle2, tone: 'bg-primary/15 text-primary' },
  homeowner_rejected: { icon: XCircle, tone: 'bg-destructive/10 text-destructive' },
  repair_photo_added: { icon: Camera, tone: 'bg-secondary text-secondary-foreground' },
  builder_reply: { icon: MessageSquare, tone: 'bg-primary/15 text-primary' },
  homeowner_comment: { icon: MessageSquare, tone: 'bg-warning/15 text-warning-foreground' },
}

const statusLabel = (v: string | null) => (v ? (ISSUE_STATUS_LABELS[v as IssueStatus] ?? v) : '—')
const priorityLabel = (v: string | null) => (v ? (PRIORITY_LABELS[v as IssuePriority] ?? v) : '—')

function describe(event: IssueEvent, nameFor: (id: string | null) => string | null): string {
  switch (event.event_type) {
    case 'reported':
      return 'Issue reported from the homeowner walkthrough'
    case 'status_changed':
      return `Status changed from ${statusLabel(event.from_value)} to ${statusLabel(event.to_value)}`
    case 'assigned':
      return event.to_value ? `Assigned to ${nameFor(event.to_value) ?? 'a team member'}` : 'Responsible person removed'
    case 'repair_recorded':
      return 'Corrective work recorded'
    case 'priority_changed':
      return `Priority changed from ${priorityLabel(event.from_value)} to ${priorityLabel(event.to_value)}`
    case 'due_date_changed':
      return event.to_value ? `Due date set to ${formatDate(event.to_value)}` : 'Due date cleared'
    case 'builder_approved':
      return 'Repair approved by builder / PM'
    case 'homeowner_accepted':
      return 'Homeowner accepted the repair'
    case 'homeowner_rejected':
      return 'Homeowner rejected the repair'
    case 'repair_photo_added':
      return 'Repair photo added'
    case 'builder_reply':
      return 'Builder replied to the homeowner'
    case 'homeowner_comment':
      return 'Homeowner commented'
  }
}

export function IssueTimeline({ events, nameFor }: { events: IssueEvent[]; nameFor: (id: string | null) => string | null }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity has been recorded yet.</p>
  }
  return (
    <ol className="flex flex-col">
      {events.map((event, index) => {
        const { icon: Icon, tone } = ICONS[event.event_type]
        const last = index === events.length - 1
        const showDetails = event.details && event.event_type !== 'repair_photo_added'
        return (
          <li key={event.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', tone)}>
                <Icon className="size-4" aria-hidden="true" />
              </span>
              {!last && <span className="w-px flex-1 bg-border" aria-hidden="true" />}
            </div>
            <div className={cn('flex min-w-0 flex-1 flex-col gap-1', !last && 'pb-6')}>
              <p className="pt-1 text-sm font-medium text-foreground">{describe(event, nameFor)}</p>
              <p className="text-xs text-muted-foreground">
                {`${nameFor(event.actor_id) ?? 'System'} · ${formatDateTime(event.created_at)}`}
                {event.event_type === 'repair_photo_added' && event.details ? ` · ${event.details}` : ''}
              </p>
              {showDetails && (
                <p className="mt-1 whitespace-pre-line rounded-lg bg-muted px-3 py-2 text-sm leading-relaxed text-foreground">{event.details}</p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
