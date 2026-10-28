import Link from 'next/link'
import { CalendarDays, MapPin, UserRound } from 'lucide-react'
import { ProjectStatusBanner } from '@/components/shared/project-status-banner'
import { ProgressBar } from '@/components/shared/progress'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format'
import type { ProjectStatus } from '@/lib/domain'
import { coverAlt, type ProjectCover } from '@/lib/project-cover'
import { CoverImage } from '@/components/projects/cover-image'

export type ProjectCardData = {
  id: string
  project_number: string
  name: string
  status: ProjectStatus
  address_line1: string
  city: string
  state: string
  progress_percent: number | null
  target_completion_date: string | null
  clientName: string | null
  managerName: string | null
  photoUrl?: string | null
  photoKind?: ProjectCover['kind']
}

/** Neutral drafting-grid placeholder used whenever a project has no real site photo. */
export function ArchitecturalPlaceholder({ className, label }: { className?: string; label?: string }) {
  return (
    <div className={cn('blueprint relative flex items-center justify-center overflow-hidden', className)} aria-hidden="true">
      <svg viewBox="0 0 200 120" className="h-3/5 w-auto text-white/35" fill="none" stroke="currentColor" strokeWidth="1.2">
        <path d="M20 100 H180" />
        <path d="M40 100 V58 L100 22 L160 58 V100" />
        <path d="M32 63 L100 22 L168 63" />
        <path d="M86 100 V72 H114 V100" />
        <path d="M52 70 H74 V88 H52 Z M126 70 H148 V88 H126 Z" />
        <path d="M63 70 V88 M52 79 H74 M137 70 V88 M126 79 H148" strokeWidth="0.6" />
        <path d="M130 40 V26 H142 V47" />
      </svg>
      {label && (
        <span className="absolute bottom-3 left-4 text-[0.7rem] font-medium tracking-wide text-white/50">{label}</span>
      )}
    </div>
  )
}

export function ProjectCard({ project, className }: { project: ProjectCardData; className?: string }) {
  const progress = project.progress_percent === null ? null : Math.round(Number(project.progress_percent))
  return (
    <Link
      href={`/projects/${project.id}`}
      className={cn(
        'group surface flex flex-col overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift',
        className,
      )}
    >
      <ProjectStatusBanner status={project.status} />
      <div className="relative aspect-[16/9] overflow-hidden">
        {project.photoUrl ? (
          <CoverImage
            src={project.photoUrl}
            alt={coverAlt(project.photoKind, project.name)}
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            fallback={<ArchitecturalPlaceholder className="size-full" label="No site photos yet" />}
          />
        ) : (
          <ArchitecturalPlaceholder className="size-full" label="No site photos yet" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-brand-deep/80 via-brand-deep/10 to-transparent" />
        <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3 text-white">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="font-mono text-[0.7rem] text-white/70">{project.project_number}</span>
            <span className="truncate font-serif text-xl font-semibold leading-tight">{project.name}</span>
          </div>
          {progress !== null && <span className="tabular shrink-0 font-serif text-2xl font-semibold">{`${progress}%`}</span>}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-5">
        {progress === null ? (
          <p className="text-xs font-medium text-muted-foreground">Progress not configured · no schedule milestones yet</p>
        ) : (
          <ProgressBar value={progress} label={`${project.name} construction progress`} size="sm" />
        )}
        <dl className="grid gap-2.5 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="size-4 shrink-0" aria-hidden="true" />
            <dt className="sr-only">Address</dt>
            <dd className="truncate">{`${project.address_line1}, ${project.city}, ${project.state}`}</dd>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <UserRound className="size-4 shrink-0" aria-hidden="true" />
            <dt className="sr-only">Homeowner</dt>
            <dd className="truncate text-foreground">{project.clientName ?? 'No homeowner linked'}</dd>
          </div>
        </dl>
        <div className="mt-auto flex items-center justify-between gap-3 border-t pt-4 text-xs">
          <span className="flex min-w-0 flex-col">
            <span className="text-muted-foreground">Project manager</span>
            <span className="truncate font-medium text-foreground">{project.managerName ?? 'Unassigned'}</span>
          </span>
          <span className="flex shrink-0 flex-col items-end">
            <span className="flex items-center gap-1 text-muted-foreground">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              Target
            </span>
            <span className="font-medium text-foreground">{formatDate(project.target_completion_date)}</span>
          </span>
        </div>
      </div>
    </Link>
  )
}
