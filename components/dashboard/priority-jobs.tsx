import Link from 'next/link'
import { ArrowRight, House } from 'lucide-react'
import { DashboardSectionHeader } from '@/components/dashboard/dashboard-section-header'
import { HealthBadge } from '@/components/dashboard/project-health'
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'
import { formatCents, formatDate } from '@/lib/format'
import type { HealthLevel } from '@/lib/project-health'
import { nextLifecycleStage, type JobSummary } from '@/lib/priority-jobs'
import type { StageActivities } from '@/lib/stage-activities'
import { stageIndicatorColor } from '@/lib/stage-colors'
import { cn } from '@/lib/utils'

export type PriorityJob = {
  id: string
  name: string
  projectNumber: string | null
  status: ProjectStatus
  managerName: string | null
  /** Approved contract value; null when not established or not permitted. */
  contractCents: number | null
  health: HealthLevel | null
  /** Activities in the current stage; null when scheduling is off or the stage has no working schedule. */
  stageActivities: StageActivities | null
  summary: JobSummary
}

function StageIndicator({ status }: { status: ProjectStatus }) {
  return (
    <span
      aria-hidden="true"
      data-stage={status}
      className="h-12 w-1 shrink-0 self-center rounded-full"
      style={{ backgroundColor: stageIndicatorColor(status) }}
    />
  )
}

function StatusCell({ job }: { job: PriorityJob }) {
  if (job.health) return <HealthBadge level={job.health} />
  return (
    <span className="inline-flex w-fit rounded-full bg-muted px-2 py-0.5 text-[0.7rem] font-semibold text-muted-foreground">
      {job.status === 'completed' ? 'Closed' : 'Not assessed'}
    </span>
  )
}

function shortDate(value: string): string {
  return formatDate(value).replace(/,\s*\d{4}$/, '')
}

/** Next activity and completion count for the current stage. Sits above the row link so clicks never navigate the row. */
function StageActivityDetails({ jobId, data }: { jobId: string; data: StageActivities | null }) {
  if (!data) return null
  if (data.state === 'unavailable') {
    return <span className="block text-xs text-muted-foreground">Activities unavailable</span>
  }
  if (data.state === 'empty') {
    return <span className="block text-xs text-muted-foreground">No activities scheduled</span>
  }
  const count = (
    <span className="tabular block text-xs text-muted-foreground">{`${data.completed} of ${data.total} activities complete`}</span>
  )
  if (data.state === 'complete') {
    return (
      <>
        <span className="block text-xs text-foreground/80">All stage activities complete</span>
        {count}
      </>
    )
  }
  const { activity } = data
  return (
    <>
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-xs">
        <Link
          href={`/projects/${jobId}/schedule?activity=${activity.id}`}
          className="relative z-10 min-w-0 max-w-full truncate font-medium text-foreground/90 underline-offset-2 hover:text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title={activity.name}
        >
          {activity.name}
        </Link>
        <span
          className={cn('tabular shrink-0', activity.overdue ? 'font-medium text-destructive' : 'text-muted-foreground')}
        >
          {activity.dueOn
            ? activity.overdue
              ? `Overdue · Due ${shortDate(activity.dueOn)}`
              : `Due ${shortDate(activity.dueOn)}`
            : 'No due date'}
        </span>
      </span>
      {count}
    </>
  )
}

function NextStage({ status, progress }: { status: ProjectStatus; progress: number | null }) {
  const next = nextLifecycleStage(status)
  const text =
    next.kind === 'stage'
      ? PROJECT_STATUS_LABELS[next.status]
      : next.kind === 'final'
        ? 'Final Stage'
        : next.kind === 'resume'
          ? 'Resumes at any stage'
          : '—'
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className={cn('truncate text-sm', next.kind === 'stage' ? 'text-foreground' : 'text-muted-foreground')}>{text}</span>
      {progress !== null && <span className="tabular text-xs text-muted-foreground">{`${progress}% complete`}</span>}
    </div>
  )
}

export function PriorityJobs({ jobs, showBudget }: { jobs: PriorityJob[]; showBudget: boolean }) {
  return (
    <section aria-labelledby="priority-jobs-heading" className="surface flex flex-col gap-4 p-4 md:p-5">
      <DashboardSectionHeader
        id="priority-jobs-heading"
        title="Priority Jobs"
        description="Ordered by verified risk, then by what is due next"
        icon={House}
        action={
          <Link
            href="/projects"
            className="group flex min-h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            View All Jobs
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        }
      />
      {jobs.length === 0 ? (
        <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">No projects yet.</p>
      ) : (
        <>
          <table className="hidden w-full table-fixed text-left text-sm lg:table">
            <thead>
              <tr className="border-b text-xs font-medium text-muted-foreground">
                <th scope="col" className="w-[26%] pb-2 font-medium">Job</th>
                <th scope="col" className="w-[25%] pb-2 font-medium">Stage</th>
                <th scope="col" className="pb-2 font-medium" title="Next stage in the configured project lifecycle">
                  Next Stage
                </th>
                {showBudget && <th scope="col" className="w-[13%] pb-2 text-right font-medium">Contract</th>}
                <th scope="col" className="w-[17%] pb-2 pl-4 font-medium">Health</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {jobs.map((job) => (
                <tr key={job.id} className="group relative align-middle hover:bg-sage/40">
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-3">
                      <StageIndicator status={job.status} />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/projects/${job.id}`}
                          className="block truncate font-semibold text-foreground outline-none after:absolute after:inset-0 after:content-[''] group-hover:text-primary focus-visible:underline"
                        >
                          {job.name}
                        </Link>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[job.projectNumber, job.managerName && `PM ${job.managerName}`].filter(Boolean).join(' · ') || '—'}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {PROJECT_STATUS_LABELS[job.status] ?? job.status}
                      </span>
                      <StageActivityDetails jobId={job.id} data={job.stageActivities} />
                    </div>
                  </td>
                  <td className="py-3 pr-3">
                    <NextStage status={job.status} progress={job.summary.progress} />
                  </td>
                  {showBudget && (
                    <td className="tabular py-3 text-right text-sm text-foreground">
                      {job.contractCents !== null ? formatCents(job.contractCents) : <span className="text-muted-foreground">—</span>}
                    </td>
                  )}
                  <td className="py-3 pl-4">
                    <StatusCell job={job} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="flex flex-col gap-2 lg:hidden">
            {jobs.map((job) => (
              <li
                key={job.id}
                className="relative flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors focus-within:ring-2 focus-within:ring-ring hover:border-primary/25"
              >
                  <StageIndicator status={job.status} />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <Link
                        href={`/projects/${job.id}`}
                        className="truncate text-sm font-semibold text-foreground outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']"
                      >
                        {job.name}
                      </Link>
                      <span className="truncate text-xs text-muted-foreground">
                        {[job.projectNumber, job.managerName && `PM ${job.managerName}`]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </div>
                    <StatusCell job={job} />
                  </div>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium text-foreground">
                      {PROJECT_STATUS_LABELS[job.status] ?? job.status}
                    </span>
                    <StageActivityDetails jobId={job.id} data={job.stageActivities} />
                  </div>
                  <div className="flex items-baseline gap-1.5 text-xs text-muted-foreground">
                    <span className="shrink-0">Next Stage:</span>
                    <NextStage status={job.status} progress={job.summary.progress} />
                  </div>
                  {showBudget && job.contractCents !== null && (
                    <span className="tabular text-xs text-muted-foreground">{`Contract ${formatCents(job.contractCents)}`}</span>
                  )}
                  </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
