import Link from 'next/link'
import { ChevronRight, MapPin } from 'lucide-react'
import { ProjectStatusBadge } from '@/components/shared/status-badge'
import { formatDate } from '@/lib/format'
import type { ProjectSummary } from '@/lib/queries'

export type ProjectListItem = ProjectSummary & { completion_date?: string | null }
export type WarrantyMilestone = { stage_label: string | null; due_on: string | null }

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate text-sm text-foreground">{children}</span>
    </div>
  )
}

function Progress({ value }: { value: number | null }) {
  if (value === null) return <Meta label="Progress">Not set</Meta>
  const pct = Math.round(Number(value))
  return (
    <div className="flex w-24 flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">
        Progress <span className="font-medium text-foreground tabular-nums">{`${pct}%`}</span>
      </span>
      <div
        className="h-1.5 rounded-full bg-sage"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Construction progress"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function ProjectList({
  projects,
  warrantyByProject,
}: {
  projects: ProjectListItem[]
  warrantyByProject?: Record<string, WarrantyMilestone | null>
}) {
  return (
    <ul className="surface flex flex-col divide-y divide-border/70 overflow-hidden p-0">
      {projects.map((project) => {
        const completed = project.status === 'completed'
        const milestone = warrantyByProject?.[project.id]
        const location = [project.city, project.state].filter(Boolean).join(', ')
        return (
          <li key={project.id}>
            <Link
              href={`/projects/${project.id}`}
              className="group flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-sage/40 focus-visible:bg-sage/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:flex-row md:items-center md:gap-6"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{project.project_number}</span>
                  <ProjectStatusBadge status={project.status} />
                </div>
                <span className="truncate font-medium text-foreground">{project.name}</span>
                {location && (
                  <span className="flex items-center gap-1 truncate text-sm text-muted-foreground">
                    <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                    {location}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 md:justify-end">
                <Meta label="Homeowner">
                  {project.primary_client
                    ? `${project.primary_client.first_name} ${project.primary_client.last_name}`
                    : '—'}
                </Meta>
                {completed ? (
                  <>
                    <Meta label="Completed">{project.completion_date ? formatDate(project.completion_date) : 'Not recorded'}</Meta>
                    {milestone?.stage_label && (
                      <Meta label="Warranty">
                        {milestone.due_on ? `${milestone.stage_label} · ${formatDate(milestone.due_on)}` : milestone.stage_label}
                      </Meta>
                    )}
                  </>
                ) : (
                  <>
                    <Meta label="Target">{formatDate(project.target_completion_date)}</Meta>
                    <Progress value={project.progress_percent} />
                  </>
                )}
                <ChevronRight
                  className="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 md:block"
                  aria-hidden="true"
                />
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
