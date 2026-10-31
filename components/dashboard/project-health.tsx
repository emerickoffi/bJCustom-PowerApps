import Link from 'next/link'
import { ArrowRight, ChevronDown, CircleAlert, CircleCheck, CircleDashed, TriangleAlert } from 'lucide-react'
import { HEALTH_LABELS, type HealthLevel } from '@/lib/project-health'
import type { HealthProject } from '@/lib/dashboard-workspace-data'
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'
import { cn } from '@/lib/utils'

const LEVEL_STYLE: Record<HealthLevel, { icon: typeof CircleCheck; badge: string }> = {
  at_risk: { icon: TriangleAlert, badge: 'bg-destructive/8 text-destructive' },
  needs_attention: { icon: CircleAlert, badge: 'bg-champagne-soft text-warning' },
  insufficient_data: { icon: CircleDashed, badge: 'bg-muted text-muted-foreground' },
  on_track: { icon: CircleCheck, badge: 'bg-sage text-success' },
}

export function HealthBadge({ level }: { level: HealthLevel }) {
  const { icon: Icon, badge } = LEVEL_STYLE[level]
  return (
    <span className={cn('inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold', badge)}>
      <Icon className="size-3.5" aria-hidden="true" />
      {HEALTH_LABELS[level]}
    </span>
  )
}

export function ProjectHealthList({
  projects,
  total,
  flagged,
}: {
  projects: HealthProject[]
  total: number
  flagged: number
}) {
  return (
    <section aria-labelledby="health-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="health-heading" className="font-serif text-xl font-semibold tracking-tight text-foreground">
            Project Health
          </h2>
          <p className="text-sm text-muted-foreground">
            {total === 0
              ? 'Active projects and their verified signals'
              : flagged > 0
                ? `${flagged} of ${total} active ${total === 1 ? 'project needs' : 'projects need'} a look`
                : `${total} active ${total === 1 ? 'project' : 'projects'}, none flagged`}
          </p>
        </div>
        <Link href="/projects" className="group flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary">
          View All
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      </div>

      {projects.length === 0 ? (
        <p className="surface p-4 text-sm text-muted-foreground">No active projects to assess.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {projects.map((p) => (
            <li key={p.id} className="min-w-0">
              <Link
                href={`/projects/${p.id}`}
                className="surface group flex h-full flex-col gap-2.5 p-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-semibold text-foreground group-hover:text-primary">{p.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {[p.project_number, PROJECT_STATUS_LABELS[p.status as ProjectStatus] ?? p.status].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <HealthBadge level={p.health.level} />
                </div>
                <span className="line-clamp-2 text-pretty text-xs leading-relaxed text-muted-foreground" title={p.health.reasons.join(' · ')}>
                  {p.health.reasons.join(' · ')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {total > projects.length && <p>{`Showing the ${projects.length} most urgent of ${total} active projects.`}</p>}
        <details className="group/how">
          <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1 font-medium text-primary hover:underline [&::-webkit-details-marker]:hidden">
            How health is assessed
            <ChevronDown className="size-3.5 transition-transform group-open/how:rotate-180" aria-hidden="true" />
          </summary>
          <p className="max-w-2xl text-pretty leading-relaxed">
            Based on schedule status, open punch list issues, Daily Log delays and your pending actions. Projects without a
            schedule or planned dates are marked Insufficient Data, never On Track.
          </p>
        </details>
      </div>
    </section>
  )
}
