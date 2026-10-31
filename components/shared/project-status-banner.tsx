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
import { LIFECYCLE_GROUP_CLASSES, PROJECT_LIFECYCLE_GROUP } from '@/lib/project-lifecycle'

type StatusStyle = { icon: LucideIcon; className: string }

const STATUS_ICONS: Record<ProjectStatus, LucideIcon> = {
  lead: UserPlus,
  consultation: MessagesSquare,
  planning: Compass,
  estimating: Ruler,
  awaiting_approval: Hourglass,
  preconstruction: CalendarClock,
  under_construction: Hammer,
  final_inspection: ClipboardCheck,
  punch_list: ListChecks,
  substantially_complete: Sparkles,
  completed: CheckCircle2,
  on_hold: PauseCircle,
  cancelled: Ban,
}

/**
 * Single source of truth for project status colors. Color follows the lifecycle group (pipeline, active
 * build, closed, on hold) and the icon plus label identify the exact stage, so status never relies on color.
 */
export const PROJECT_STATUS_STYLES = Object.fromEntries(
  (Object.keys(STATUS_ICONS) as ProjectStatus[]).map((s) => [
    s,
    { icon: STATUS_ICONS[s], className: LIFECYCLE_GROUP_CLASSES[PROJECT_LIFECYCLE_GROUP[s]] },
  ]),
) as Record<ProjectStatus, StatusStyle>

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
