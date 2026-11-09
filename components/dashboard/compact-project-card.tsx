import Link from 'next/link'
import {
  ArrowRight,
  CalendarPlus,
  CircleAlert,
  CircleArrowRight,
  CircleCheck,
  CircleDashed,
  CircleOff,
  FileText,
  Hourglass,
  PauseCircle,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { ArchitecturalPlaceholder } from '@/components/projects/project-card'
import { CoverImage } from '@/components/projects/cover-image'
import { ProjectTypeLabel } from '@/components/projects/project-type-label'
import { PROJECT_STATUS_STYLES } from '@/components/shared/project-status-banner'
import { ProgressBar } from '@/components/shared/progress'
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'
import type { DashboardCardDetails } from '@/lib/dashboard-cards'
import { buildNextAction, type NextAction, type NextActionIcon, type NextActionTone } from '@/lib/project-next-action'
import { formatDate } from '@/lib/format'
import { coverAlt, type ProjectCover } from '@/lib/project-cover'
import { formatLocation } from '@/lib/location-display'
import { cn } from '@/lib/utils'

export type CompactProjectCardData = {
  id: string
  project_number: string
  name: string
  status: ProjectStatus
  project_type?: string | null
  city: string
  state: string
  /** Normalized "City, ST" for display; falls back to the stored values when absent. */
  locationLabel?: string
  progress_percent: number | null
  completion_date: string | null
  photoUrl: string | null
  photoKind?: ProjectCover['kind']
  details: DashboardCardDetails
  warrantyEnabled: boolean
}

export type Panel = NextAction & { Icon: LucideIcon }

export const PANEL_ICONS: Record<NextActionIcon, LucideIcon> = {
  hold: PauseCircle,
  overdue: CircleAlert,
  next: CircleArrowRight,
  blocked: Hourglass,
  schedule: CalendarPlus,
  estimate: FileText,
  claim: Wrench,
  warranty: ShieldCheck,
  completed: CircleCheck,
  none: CircleDashed,
  error: CircleOff,
}

/** Cards, table rows and dashboards all derive the next action from the same rules in `lib/project-next-action`. */
export function buildPanel(p: CompactProjectCardData): Panel {
  const action = buildNextAction(p, p.details)
  return { ...action, Icon: PANEL_ICONS[action.icon] }
}

const PANEL_TONES: Record<NextActionTone, string> = {
  neutral: 'bg-muted/70 text-foreground',
  danger: 'bg-red-50 text-red-900',
  success: 'bg-green-50 text-green-950',
  muted: 'border border-dashed border-[#D6DDE5] bg-transparent text-muted-foreground',
}

const ICON_TONES: Record<NextActionTone, string> = {
  neutral: 'text-primary',
  danger: 'text-red-600',
  success: 'text-green-700',
  muted: 'text-muted-foreground',
}

export function CompactProjectCard({
  project,
  footer,
  showType = false,
}: {
  project: CompactProjectCardData
  footer?: React.ReactNode
  showType?: boolean
}) {
  const status = PROJECT_STATUS_STYLES[project.status]
  const StatusIcon = status.icon
  const showProgress =
    project.details.hasSchedule && project.status !== 'completed' && project.progress_percent !== null
  const progress = showProgress ? Math.round(Number(project.progress_percent)) : null
  const showHealth = project.details.behindSchedule && project.status !== 'completed' && project.status !== 'on_hold'
  const panel = buildPanel(project)
  const PanelIcon = panel.Icon

  const panelBody = (
    <>
      <PanelIcon className={cn('mt-0.5 size-4 shrink-0', ICON_TONES[panel.tone])} aria-hidden="true" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="sr-only">{panel.kind === 'action' ? 'Next action: ' : 'Status: '}</span>
        <span className={cn('line-clamp-2 text-sm leading-snug', panel.kind === 'action' ? 'font-medium' : 'font-normal')}>
          {panel.title}
        </span>
        {panel.meta && <span className="line-clamp-2 text-xs leading-relaxed opacity-75">{panel.meta}</span>}
      </span>
      {panel.href && panel.kind === 'action' && (
        <ArrowRight
          className="mt-0.5 size-4 shrink-0 opacity-60 transition-transform group-hover/next:translate-x-0.5"
          aria-hidden="true"
        />
      )}
    </>
  )
  const panelClass = cn('flex items-start gap-2.5 rounded-xl px-3 py-2.5', PANEL_TONES[panel.tone])

  return (
    <article className="group relative flex flex-col gap-3.5 rounded-2xl border bg-card p-4 shadow-xs transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring/40">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-mono text-xs text-muted-foreground">{project.project_number}</span>
          <h3 className="line-clamp-2 text-pretty break-words font-serif text-lg font-semibold leading-snug">
            <Link
              href={`/projects/${project.id}`}
              className="outline-none after:absolute after:inset-0 after:rounded-2xl after:content-['']"
            >
              {project.name}
            </Link>
          </h3>
          <span className="truncate text-xs text-muted-foreground">
            {project.locationLabel ?? formatLocation(project.city, project.state)}
          </span>
          {showType && <ProjectTypeLabel type={project.project_type} className="mt-0.5" />}
        </div>
        <div className="relative aspect-[4/3] w-24 shrink-0 overflow-hidden rounded-xl bg-muted sm:w-28">
          {project.photoUrl ? (
            <CoverImage
              src={project.photoUrl}
              alt={coverAlt(project.photoKind, project.name)}
              className="size-full object-cover"
              fallback={<ArchitecturalPlaceholder className="size-full bg-brand-deep" />}
            />
          ) : (
            <ArchitecturalPlaceholder className="size-full bg-brand-deep" />
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-badge px-2.5 py-0.5 text-xs font-semibold',
            status.className,
          )}
        >
          <StatusIcon className="size-3.5" aria-hidden="true" />
          {PROJECT_STATUS_LABELS[project.status]}
        </span>
        {showHealth && (
          <span className="inline-flex items-center rounded-badge bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-800">
            Overdue activity
          </span>
        )}
      </div>

      {project.status === 'completed' ? (
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">Completed</span>
          <span className="font-medium text-foreground">
            {project.completion_date ? formatDate(project.completion_date) : 'Date not recorded'}
          </span>
        </div>
      ) : (
        progress !== null && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted-foreground">Construction progress</span>
              <span className="tabular font-semibold text-foreground">{`${progress}%`}</span>
            </div>
            <ProgressBar value={progress} label={`${project.name} construction progress`} size="sm" />
          </div>
        )
      )}

      <div className="mt-auto">
        {panel.href ? (
          <Link
            href={panel.href}
            className={cn(
              panelClass,
              'group/next relative z-10 transition-colors hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            {panelBody}
          </Link>
        ) : (
          <div className={panelClass}>{panelBody}</div>
        )}
      </div>
      {footer}
    </article>
  )
}
