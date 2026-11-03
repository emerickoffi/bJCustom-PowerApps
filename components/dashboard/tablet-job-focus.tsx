import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { CoverImage } from '@/components/projects/cover-image'
import { ArchitecturalPlaceholder } from '@/components/projects/project-card'
import { CurrentStage, HealthCell, NextActivity, type PriorityJob } from '@/components/dashboard/priority-jobs'
import { coverAlt, type ProjectCover } from '@/lib/project-cover'

const PRIORITY_LIMIT = 4

function JobFocusCard({ job, cover, large = false }: { job: PriorityJob; cover: ProjectCover | undefined; large?: boolean }) {
  const fallback = <ArchitecturalPlaceholder className="size-full" label="No site photos yet" />
  return (
    <article className="relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-xs transition-[box-shadow,border-color] hover:border-interactive/40 hover:shadow-md focus-within:ring-2 focus-within:ring-ring/40 active:shadow-xs motion-reduce:transition-none">
      <div className={large ? 'aspect-[21/9] w-full shrink-0 bg-muted' : 'aspect-[16/7] w-full shrink-0 bg-muted'}>
        {cover ? (
          <CoverImage src={cover.url} alt={coverAlt(cover.kind, job.name)} className="size-full object-cover" fallback={fallback} />
        ) : (
          fallback
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            {job.projectNumber && <span className="font-mono text-xs text-muted-foreground">{job.projectNumber}</span>}
            <h3 className="line-clamp-2 break-words font-serif text-lg font-semibold leading-snug">
              <Link
                href={`/projects/${job.id}`}
                className="after:absolute after:inset-0 hover:text-link focus-visible:outline-none"
              >
                {job.name}
              </Link>
            </h3>
          </div>
          <div className="relative z-10 shrink-0">
            <HealthCell job={job} />
          </div>
        </div>
        <CurrentStage job={job} />
        <div className="mt-auto flex flex-col gap-1 border-t border-divider pt-3">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Next activity</span>
          <NextActivity job={job} />
        </div>
      </div>
    </article>
  )
}

/**
 * One selected project shows its own summary; All projects shows the top Priority Jobs. Ranking, stage, and health
 * come unchanged from the Priority Jobs pipeline.
 */
export function TabletJobFocus({
  jobs,
  selected,
  covers,
}: {
  jobs: PriorityJob[]
  /** The project chosen in the project selector, or null for All projects. */
  selected: { job: PriorityJob | null; name: string } | null
  covers: Map<string, ProjectCover>
}) {
  if (selected) {
    return selected.job ? (
      <JobFocusCard job={selected.job} cover={covers.get(selected.job.id)} large />
    ) : (
      <p className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground shadow-xs">
        {`A summary for ${selected.name} could not be loaded.`}
      </p>
    )
  }

  const shown = jobs.slice(0, PRIORITY_LIMIT)
  return (
    <section aria-labelledby="tablet-job-focus-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="tablet-job-focus-heading" className="font-serif text-lg font-semibold">
          Priority jobs
        </h2>
        <Link
          href="/projects"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-interactive-strong hover:bg-interactive-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          View all projects
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      {shown.length === 0 ? (
        <p className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground shadow-xs">
          No active jobs need focus right now.
        </p>
      ) : (
        <div className="grid gap-4 min-[900px]:grid-cols-2">
          {shown.map((job) => (
            <JobFocusCard key={job.id} job={job} cover={covers.get(job.id)} />
          ))}
        </div>
      )}
    </section>
  )
}
