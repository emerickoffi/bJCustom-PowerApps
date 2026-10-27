import {
  Ban,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Compass,
  Hammer,
  Hourglass,
  ListChecks,
  MessagesSquare,
  PauseCircle,
  Ruler,
  Sparkles,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'

type StatusStyle = { icon: LucideIcon; className: string }

/** Single source of truth for project status colors. Solid fills keep text at WCAG AA contrast. */
export const PROJECT_STATUS_STYLES: Record<ProjectStatus, StatusStyle> = {
  lead: { icon: UserPlus, className: 'bg-stone-600 text-white' },
  consultation: { icon: MessagesSquare, className: 'bg-stone-600 text-white' },
  planning: { icon: Compass, className: 'bg-cyan-700 text-white' },
  estimating: { icon: Ruler, className: 'bg-cyan-700 text-white' },
  awaiting_approval: { icon: Hourglass, className: 'bg-yellow-300 text-yellow-950' },
  preconstruction: { icon: CalendarClock, className: 'bg-amber-400 text-amber-950' },
  under_construction: { icon: Hammer, className: 'bg-blue-600 text-white' },
  final_inspection: { icon: ClipboardCheck, className: 'bg-purple-600 text-white' },
  punch_list: { icon: ListChecks, className: 'bg-orange-500 text-orange-950' },
  substantially_complete: { icon: Sparkles, className: 'bg-teal-700 text-white' },
  completed: { icon: CheckCircle2, className: 'bg-green-700 text-white' },
  on_hold: { icon: PauseCircle, className: 'bg-red-600 text-white' },
  cancelled: { icon: Ban, className: 'bg-slate-500 text-white' },
}

export function ProjectStatusBanner({
  status,
  compact = false,
  className,
}: {
  status: ProjectStatus
  compact?: boolean
  className?: string
}) {
  const style = PROJECT_STATUS_STYLES[status] ?? { icon: ClipboardList, className: 'bg-slate-500 text-white' }
  const Icon = style.icon
  const label = PROJECT_STATUS_LABELS[status] ?? status

  if (compact) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide',
          style.className,
          className,
        )}
      >
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        {label}
      </span>
    )
  }

  return (
    <div
      className={cn(
        'flex w-full items-center gap-2 px-4 py-2 text-sm font-semibold uppercase tracking-wider',
        style.className,
        className,
      )}
    >
      <Icon className="size-[1.125rem] shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </div>
  )
}
