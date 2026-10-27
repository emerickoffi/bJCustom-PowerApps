import Link from 'next/link'
import { MapPin } from 'lucide-react'
import { ProjectStatusBadge } from '@/components/shared/status-badge'
import { formatDate } from '@/lib/format'
import type { ProjectSummary } from '@/lib/queries'

export function ProjectList({ projects }: { projects: ProjectSummary[] }) {
  return (
    <ul className="surface flex flex-col divide-y divide-border/70 overflow-hidden p-0">
      {projects.map((project) => (
        <li key={project.id}>
          <Link
            href={`/projects/${project.id}`}
            className="flex flex-col gap-3 p-5 transition-colors hover:bg-sage/40 md:flex-row md:items-center md:gap-6"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{project.project_number}</span>
                <ProjectStatusBadge status={project.status} />
              </div>
              <span className="truncate font-medium text-foreground">{project.name}</span>
              <span className="flex items-center gap-1 truncate text-sm text-muted-foreground">
                <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                {`${project.address_line1}, ${project.city}, ${project.state}`}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-6 text-sm md:w-80 md:justify-end">
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Homeowner</span>
                <span className="text-foreground">
                  {project.primary_client
                    ? `${project.primary_client.first_name} ${project.primary_client.last_name}`
                    : '—'}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Target</span>
                <span className="text-foreground">{formatDate(project.target_completion_date)}</span>
              </div>
              {project.progress_percent === null ? (
                <div className="flex w-20 flex-col">
                  <span className="text-xs text-muted-foreground">Progress</span>
                  <span className="text-xs text-foreground">Not set</span>
                </div>
              ) : (
              <div className="flex w-20 flex-col gap-1">
                <span className="text-xs text-muted-foreground">{`${Math.round(Number(project.progress_percent))}%`}</span>
                <div
                  className="h-1.5 rounded-full bg-sage"
                  role="progressbar"
                  aria-valuenow={Number(project.progress_percent)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Progress"
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Number(project.progress_percent)}%` }}
                  />
                </div>
              </div>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
