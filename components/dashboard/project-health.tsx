import Link from 'next/link'
import { Activity, ArrowRight, CalendarPlus, CircleAlert, CircleCheck, CircleDashed, Info, TriangleAlert } from 'lucide-react'
import { HEALTH_LABELS, needsScheduleSetup, type HealthLevel } from '@/lib/project-health'
import type { HealthProject } from '@/lib/dashboard-workspace-data'
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'
import { DashboardSectionHeader } from '@/components/dashboard/dashboard-section-header'
import { cn } from '@/lib/utils'

const LEVEL_STYLE: Record<HealthLevel, { icon: typeof CircleCheck; badge: string; accent: string }> = {
  at_risk: { icon: TriangleAlert, badge: 'bg-destructive/8 text-destructive', accent: 'bg-destructive/70' },
  needs_attention: { icon: CircleAlert, badge: 'bg-champagne-soft text-warning', accent: 'bg-champagne' },
  insufficient_data: { icon: CircleDashed, badge: 'bg-muted text-muted-foreground', accent: 'bg-border' },
  on_track: { icon: CircleCheck, badge: 'bg-sage text-success', accent: 'bg-primary/60' },
}

export function HealthBadge({ level }: { level: HealthLevel }) {
  const { icon: Icon, badge } = LEVEL_STYLE[level]
  return (
    <span
      className={cn(
        'inline-flex w-fit shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold',
        badge,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {HEALTH_LABELS[level]}
    </span>
  )
}

function HowAssessed() {
  return (
    <details className="group/how relative">
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-open/how:bg-muted group-open/how:text-foreground [&::-webkit-details-marker]:hidden">
        <Info className="size-3.5" aria-hidden="true" />
        How health is assessed
      </summary>
      <div className="absolute right-0 top-full z-20 mt-2 w-64 max-w-[calc(100vw-3rem)] rounded-xl border bg-popover p-3 text-xs leading-relaxed text-popover-foreground shadow-lg">
        Health is based on schedule status, open punch list items, Daily Log delays, and pending actions.
      </div>
    </details>
  )
}

function HealthCard({
  project,
  canSetUpSchedule,
  wide,
}: {
  project: HealthProject
  canSetUpSchedule: boolean
  wide: boolean
}) {
  const { level, reasons } = project.health
  const showSetup = canSetUpSchedule && needsScheduleSetup(project.health)
  const meta = [project.project_number, PROJECT_STATUS_LABELS[project.status as ProjectStatus] ?? project.status]
    .filter(Boolean)
    .join(' · ')

  const action = showSetup ? (
    <Link
      href={`/projects/${project.id}/schedule`}
      className="relative z-10 inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg bg-sage px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <CalendarPlus className="size-3.5" aria-hidden="true" />
      Set Up Schedule
      <span className="sr-only">{` for ${project.name}`}</span>
    </Link>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
      View project
      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </span>
  )

  const title = (
    <div className="flex min-w-0 flex-col gap-0.5">
      <h3 className="truncate text-sm font-semibold text-foreground group-hover:text-primary">
        <Link href={`/projects/${project.id}`} className="outline-none after:absolute after:inset-0 after:content-['']">
          {project.name}
        </Link>
      </h3>
      {meta && <span className="truncate text-xs text-muted-foreground">{meta}</span>}
    </div>
  )

  const reasonList = (
    <ul className="flex min-w-0 flex-col gap-0.5 text-xs leading-relaxed text-muted-foreground">
      {reasons.map((reason) => (
        <li key={reason} className="text-pretty">
          {reason}
        </li>
      ))}
    </ul>
  )

  return (
    <article className="group relative flex h-full overflow-hidden rounded-xl border bg-card transition-[border-color,box-shadow] hover:border-primary/25 hover:shadow-sm focus-within:ring-2 focus-within:ring-ring/40">
      <span className={cn('w-1 shrink-0', LEVEL_STYLE[level].accent)} aria-hidden="true" />
      {wide ? (
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 md:flex-row md:items-center md:gap-6">
          <div className="flex items-start justify-between gap-3 md:w-72 md:shrink-0">
            {title}
            <span className="md:hidden">
              <HealthBadge level={level} />
            </span>
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="hidden md:inline-flex">
              <HealthBadge level={level} />
            </span>
            {reasonList}
          </div>
          {action}
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-4">
          <div className="flex items-start justify-between gap-3">
            {title}
            <HealthBadge level={level} />
          </div>
          {reasonList}
          <div className="mt-auto pt-1">{action}</div>
        </div>
      )}
    </article>
  )
}

export function ProjectHealthList({
  projects,
  total,
  flagged,
  canSetUpSchedule,
}: {
  projects: HealthProject[]
  total: number
  flagged: number
  canSetUpSchedule: boolean
}) {
  const single = projects.length === 1
  const description =
    total === 0
      ? 'Active projects and their verified signals'
      : flagged > 0
        ? `${flagged} of ${total} active ${total === 1 ? 'project needs' : 'projects need'} a look`
        : `${total} active ${total === 1 ? 'project' : 'projects'}, none flagged`

  return (
    <section aria-labelledby="health-heading" className="surface flex flex-col gap-4 p-5 md:p-6">
      <DashboardSectionHeader
        id="health-heading"
        title="Project Health"
        description={description}
        icon={Activity}
        action={
          <>
            <HowAssessed />
            <Link
              href="/projects"
              className="group/all flex min-h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              View All
              <ArrowRight className="size-4 transition-transform group-hover/all:translate-x-0.5" aria-hidden="true" />
            </Link>
          </>
        }
      />

      {projects.length === 0 ? (
        <p className="rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">No active projects to assess.</p>
      ) : (
        <ul
          className={cn(
            'grid gap-3',
            !single && 'md:grid-cols-2',
            projects.length >= 3 && 'xl:grid-cols-3',
          )}
        >
          {projects.map((p) => (
            <li key={p.id} className="min-w-0">
              <HealthCard project={p} canSetUpSchedule={canSetUpSchedule} wide={single} />
            </li>
          ))}
        </ul>
      )}
      {total > projects.length && (
        <p className="-mt-1 text-xs text-muted-foreground">{`Showing the ${projects.length} most urgent of ${total} active projects.`}</p>
      )}
    </section>
  )
}
