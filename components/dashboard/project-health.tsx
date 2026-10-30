import Link from 'next/link'
import { ArrowRight, CircleAlert, CircleCheck, CircleDashed, TriangleAlert } from 'lucide-react'
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
    <section aria-labelledby="health-heading" className="surface flex flex-col gap-4 p-5 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-4">
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
        <Link href="/projects" className="group flex items-center gap-1.5 text-sm font-medium text-primary">
          All projects
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      </div>

      {projects.length === 0 ? (
        <p className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">No active projects to assess.</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/projects/${p.id}`}
                className="group flex flex-col gap-2 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-start sm:justify-between sm:gap-4"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-semibold text-foreground group-hover:text-primary">{p.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {[p.project_number, PROJECT_STATUS_LABELS[p.status as ProjectStatus] ?? p.status].filter(Boolean).join(' · ')}
                  </span>
                  <span className="text-pretty text-xs leading-relaxed text-muted-foreground">
                    {p.health.reasons.join(' · ')}
                  </span>
                </div>
                <HealthBadge level={p.health.level} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {total > projects.length && (
        <p className="text-xs text-muted-foreground">{`Showing the ${projects.length} most urgent of ${total} active projects.`}</p>
      )}
      <p className="text-xs text-muted-foreground">
        Based on schedule status, open punch list issues, Daily Log delays and your pending actions. Projects without a
        schedule are marked Insufficient Data, never On Track.
      </p>
    </section>
  )
}
