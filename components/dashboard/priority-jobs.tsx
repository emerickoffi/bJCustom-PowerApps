import Link from 'next/link'
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  FileQuestion,
  House,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { DashboardSectionHeader } from '@/components/dashboard/dashboard-section-header'
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { ACTIVITY_TYPE_LABELS, type ActivityType } from '@/lib/schedule'
import { HEALTH_LABELS, type HealthLevel } from '@/lib/project-health'
import type { JobSummary } from '@/lib/priority-jobs'
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
  /** Completed jobs remain listed only with a verified open action item; this is its title. */
  closeoutReason?: string | null
  /** Whether the Schedule module is on, so a "Set up schedule" link leads somewhere real. */
  canSetUpSchedule?: boolean
  summary: JobSummary
}

const focusRing = 'focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function StageDot({ status }: { status: ProjectStatus }) {
  return (
    <span
      aria-hidden="true"
      data-stage={status}
      className="size-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: stageIndicatorColor(status) }}
    />
  )
}

type HealthIndicatorKey = HealthLevel | 'closed' | 'not_assessed'

const HEALTH_INDICATOR: Record<HealthIndicatorKey, { icon: LucideIcon; className: string }> = {
  on_track: { icon: CircleCheck, className: 'bg-sage text-success' },
  needs_attention: { icon: TriangleAlert, className: 'bg-champagne-soft text-warning' },
  at_risk: { icon: CircleAlert, className: 'bg-destructive/8 text-destructive' },
  insufficient_data: { icon: FileQuestion, className: 'bg-slate-100 text-slate-600' },
  not_assessed: { icon: CircleHelp, className: 'bg-slate-100 text-slate-600' },
  closed: { icon: CircleCheck, className: 'bg-muted text-muted-foreground' },
}

const UNKNOWN_INDICATOR = { icon: CircleHelp, className: 'bg-muted text-muted-foreground' }

function HealthCell({ job }: { job: PriorityJob }) {
  const key: HealthIndicatorKey = job.health ?? (job.status === 'completed' ? 'closed' : 'not_assessed')
  const label = job.health
    ? (HEALTH_LABELS[job.health] ?? job.health)
    : key === 'closed'
      ? 'Closed'
      : 'Not assessed'
  const { icon: Icon, className } = HEALTH_INDICATOR[key] ?? UNKNOWN_INDICATOR

  return (
    <span
      data-health={key}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold leading-4 @2xl:whitespace-nowrap',
        className,
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{label}</span>
    </span>
  )
}

function shortDate(value: string): string {
  return formatDate(value).replace(/,\s*\d{4}$/, '')
}

function stageLabel(status: ProjectStatus): string {
  return PROJECT_STATUS_LABELS[status] ?? status
}

function JobIdentity({ job }: { job: PriorityJob }) {
  const meta = [job.projectNumber, job.managerName && `PM ${job.managerName}`].filter(Boolean).join(' · ')
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <Link
        href={`/projects/${job.id}`}
        className={cn('truncate text-sm font-semibold text-foreground underline-offset-2 hover:text-primary hover:underline', focusRing)}
      >
        {job.name}
      </Link>
      <span className="truncate text-xs text-muted-foreground">{meta || 'No job ID or PM'}</span>
    </div>
  )
}

function OpenProjectLink({ job }: { job: PriorityJob }) {
  return (
    <Link
      href={`/projects/${job.id}`}
      aria-label={`Open project ${job.name}`}
      className="flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChevronRight className="size-[18px]" aria-hidden="true" />
    </Link>
  )
}

/** Stage name plus a thin bar of activities complete within the current stage only. */
function CurrentStage({ job }: { job: PriorityJob }) {
  const data = job.stageActivities
  const counts = data && (data.state === 'next' || data.state === 'blocked' || data.state === 'complete') ? data : null
  const pct = counts ? Math.round((counts.completed / counts.total) * 100) : 0
  const label = stageLabel(job.status)
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="flex min-w-0 items-center gap-2">
        <StageDot status={job.status} />
        <span className="truncate text-sm font-medium text-foreground">{label}</span>
      </span>
      {counts && (
        <>
          <div
            role="progressbar"
            aria-label={`${label} stage activities`}
            aria-valuemin={0}
            aria-valuemax={counts.total}
            aria-valuenow={counts.completed}
            aria-valuetext={`${counts.completed} of ${counts.total} ${label} stage activities complete`}
            className="h-1 w-full max-w-40 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
          <span aria-hidden="true" className="tabular text-xs text-muted-foreground">{`${counts.completed} of ${counts.total} complete`}</span>
        </>
      )}
    </div>
  )
}

/** Next actionable activity for the current stage. Sits above the row overlay link so it navigates independently. */
function NextActivity({ job }: { job: PriorityJob }) {
  const data = job.stageActivities
  const muted = (text: string) => <span className="text-xs text-muted-foreground">{text}</span>
  if (job.closeoutReason)
    return (
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm text-foreground" title={job.closeoutReason}>
          {job.closeoutReason}
        </span>
        {muted('Open closeout action')}
      </div>
    )
  if (!data) return muted(job.status === 'on_hold' ? 'Paused while on hold' : 'No active stage schedule')
  if (data.state === 'unavailable') return muted('Activities could not be loaded')
  if (data.state === 'empty')
    return (
      <div className="flex min-w-0 flex-col items-start gap-0.5">
        {muted('No activities scheduled')}
        {job.canSetUpSchedule && (
          <Link
            href={`/projects/${job.id}/schedule`}
            className={cn('relative z-10 text-xs font-medium text-primary underline-offset-2 hover:underline', focusRing)}
          >
            Set up schedule
          </Link>
        )}
      </div>
    )
  if (data.state === 'complete') return <span className="text-xs text-foreground/80">All stage activities complete</span>

  const { activity } = data
  const typeLabel = activity.type && activity.type !== 'task' ? ACTIVITY_TYPE_LABELS[activity.type as ActivityType] : null
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <Link
        href={`/projects/${job.id}/schedule?activity=${activity.id}`}
        className={cn(
          'relative z-10 truncate text-sm text-foreground underline-offset-2 hover:text-primary hover:underline',
          focusRing,
        )}
      >
        {activity.name}
        {typeLabel && <span className="text-muted-foreground">{` · ${typeLabel}`}</span>}
      </Link>
      {data.state === 'blocked' ? (
        <span className="text-xs font-medium text-warning">Waiting on a predecessor</span>
      ) : activity.dueOn ? (
        activity.overdue ? (
          <span className="tabular inline-flex items-center gap-1 text-xs font-medium text-destructive">
            <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
            {`Overdue · Due ${shortDate(activity.dueOn)}`}
          </span>
        ) : (
          <span className="tabular inline-flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
            {`Due ${shortDate(activity.dueOn)}`}
          </span>
        )
      ) : (
        muted('No due date')
      )}
    </div>
  )
}

export function PriorityJobs({ jobs }: { jobs: PriorityJob[] }) {
  return (
    <section aria-labelledby="priority-jobs-heading" className="surface flex flex-col">
      <DashboardSectionHeader
        compact
        className="rounded-t-[inherit] border-b border-[#D8DED8] bg-card px-4 py-3 md:px-6"
        id="priority-jobs-heading"
        title="Priority Jobs"
        description="Ordered by verified risk, then by what is due next"
        icon={House}
        action={
          <Link
            href="/projects"
            className="group -mr-2 flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            View All Jobs
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        }
      />
      <div className="flex flex-col gap-4 rounded-b-[inherit] bg-card px-4 pb-4 pt-3 md:px-6 md:pb-6 md:pt-4">
      {jobs.length === 0 ? (
        <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">No projects yet.</p>
      ) : (
        <>
          {/* Container query: the table needs the card itself to be wide, regardless of viewport. */}
          <div className="@container">
          <table className="hidden w-full table-fixed text-left text-sm @2xl:table">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th scope="col" className="w-[30%] pb-2 pl-2 pr-4 font-medium">Project</th>
                <th scope="col" className="w-[23%] pb-2 pr-4 font-medium">Stage</th>
                <th scope="col" className="pb-2 pr-4 font-medium">Next step</th>
                <th scope="col" className="w-[17%] pb-2 pr-2 font-medium">Health</th>
                <th scope="col" className="w-12 pb-2">
                  <span className="sr-only">Open project</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {jobs.map((job) => (
                <tr key={job.id} className="align-top transition-colors hover:bg-[#F7F8F5]">
                  <td className="py-3.5 pl-2 pr-4">
                    <JobIdentity job={job} />
                  </td>
                  <td className="py-3.5 pr-4">
                    <CurrentStage job={job} />
                  </td>
                  <td className="py-3.5 pr-4">
                    <NextActivity job={job} />
                  </td>
                  <td className="py-3.5 pr-2">
                    <HealthCell job={job} />
                  </td>
                  <td className="py-2 pr-1 align-middle">
                    <OpenProjectLink job={job} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="flex flex-col divide-y divide-border/60 @2xl:hidden">
            {jobs.map((job) => (
              <li key={job.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <JobIdentity job={job} />
                  <OpenProjectLink job={job} />
                </div>
                <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-2.5">
                  <dt className="pt-0.5 text-xs text-muted-foreground">Stage</dt>
                  <dd className="min-w-0">
                    <CurrentStage job={job} />
                  </dd>
                  <dt className="pt-0.5 text-xs text-muted-foreground">Next step</dt>
                  <dd className="min-w-0">
                    <NextActivity job={job} />
                  </dd>
                  <dt className="pt-0.5 text-xs text-muted-foreground">Health</dt>
                  <dd className="min-w-0">
                    <HealthCell job={job} />
                  </dd>
                </dl>
              </li>
            ))}
          </ul>
          </div>
        </>
      )}
      </div>
    </section>
  )
}
