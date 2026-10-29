import Link from 'next/link'
import { ArrowRight, CalendarPlus, CircleArrowRight, CircleCheck, PauseCircle, ShieldCheck } from 'lucide-react'
import { ArchitecturalPlaceholder } from '@/components/projects/project-card'
import { CoverImage } from '@/components/projects/cover-image'
import { PROJECT_STATUS_STYLES } from '@/components/shared/project-status-banner'
import { ProgressBar } from '@/components/shared/progress'
import { WARRANTY_STAGE_LABELS, type WarrantyStage } from '@/components/warranty/stage'
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'
import type { DashboardCardDetails } from '@/lib/dashboard-cards'
import { formatDate } from '@/lib/format'
import { coverAlt, type ProjectCover } from '@/lib/project-cover'
import { cn } from '@/lib/utils'

export type CompactProjectCardData = {
  id: string
  project_number: string
  name: string
  status: ProjectStatus
  city: string
  state: string
  progress_percent: number | null
  completion_date: string | null
  photoUrl: string | null
  photoKind?: ProjectCover['kind']
  details: DashboardCardDetails
  warrantyEnabled: boolean
}

type Panel = {
  icon: typeof CircleArrowRight
  title: string
  meta: string | null
  href?: string
  tone: 'neutral' | 'danger' | 'success'
}

function buildPanel(p: CompactProjectCardData): Panel {
  const { details } = p
  if (p.status === 'on_hold') {
    return {
      icon: PauseCircle,
      title: 'On hold',
      meta: details.holdReason ?? 'No hold reason recorded',
      tone: 'danger',
    }
  }
  if (p.status === 'completed') {
    const w = details.warranty
    if (w) {
      const stage = WARRANTY_STAGE_LABELS[w.stage as WarrantyStage] ?? w.stage
      return {
        icon: ShieldCheck,
        title: w.milestoneLabel ? `Warranty: ${w.milestoneLabel}` : `Warranty: ${stage}`,
        meta: w.milestoneDueOn ? `Due ${formatDate(w.milestoneDueOn)}` : stage,
        href: `/projects/${p.id}/warranty`,
        tone: 'success',
      }
    }
    return {
      icon: CircleCheck,
      title: 'Project completed',
      meta: p.warrantyEnabled ? 'Warranty not yet activated' : null,
      href: p.warrantyEnabled ? `/projects/${p.id}/warranty` : undefined,
      tone: 'success',
    }
  }
  if (details.scheduleNotStarted) {
    return {
      icon: CalendarPlus,
      title: 'Set up construction schedule',
      meta: `${details.activityCount} ${details.activityCount === 1 ? 'activity' : 'activities'} · no dates planned yet`,
      href: `/projects/${p.id}/schedule`,
      tone: 'neutral',
    }
  }
  const next = details.nextActivity
  if (next) {
    return {
      icon: CircleArrowRight,
      title: `Next: ${next.name}`,
      meta: next.dueOn ? `${next.overdue ? 'Overdue since' : 'Due'} ${formatDate(next.dueOn)}` : 'No due date set',
      href: `/projects/${p.id}/schedule`,
      tone: next.overdue ? 'danger' : 'neutral',
    }
  }
  return {
    icon: CircleArrowRight,
    title: details.hasSchedule ? 'All scheduled activities complete' : 'No schedule activities yet',
    meta: null,
    tone: 'neutral',
  }
}

const PANEL_TONES: Record<Panel['tone'], string> = {
  neutral: 'bg-muted/70 text-foreground',
  danger: 'bg-red-50 text-red-900',
  success: 'bg-green-50 text-green-950',
}

const ICON_TONES: Record<Panel['tone'], string> = {
  neutral: 'text-primary',
  danger: 'text-red-600',
  success: 'text-green-700',
}

export function CompactProjectCard({
  project,
  footer,
}: {
  project: CompactProjectCardData
  footer?: React.ReactNode
}) {
  const status = PROJECT_STATUS_STYLES[project.status]
  const StatusIcon = status.icon
  const showProgress =
    project.details.hasSchedule && project.status !== 'completed' && project.progress_percent !== null
  const progress = showProgress ? Math.round(Number(project.progress_percent)) : null
  const showHealth = project.details.behindSchedule && project.status !== 'completed' && project.status !== 'on_hold'
  const panel = buildPanel(project)
  const PanelIcon = panel.icon

  const panelBody = (
    <>
      <PanelIcon className={cn('mt-0.5 size-4 shrink-0', ICON_TONES[panel.tone])} aria-hidden="true" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="line-clamp-2 text-sm font-medium leading-snug">{panel.title}</span>
        {panel.meta && <span className="line-clamp-2 text-xs leading-relaxed opacity-75">{panel.meta}</span>}
      </span>
      {panel.href && (
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
          <span className="truncate text-xs text-muted-foreground">{`${project.city}, ${project.state}`}</span>
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
            'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
            status.className,
          )}
        >
          <StatusIcon className="size-3.5" aria-hidden="true" />
          {PROJECT_STATUS_LABELS[project.status]}
        </span>
        {showHealth && (
          <span className="inline-flex items-center rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-800">
            Behind schedule
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
