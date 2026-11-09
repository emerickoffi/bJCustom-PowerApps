import Link from 'next/link'
import { AlertCircle, ArrowRight, CalendarDays, ChevronRight, House } from 'lucide-react'
import { DashboardSectionHeader } from '@/components/dashboard/dashboard-section-header'
import { HealthBadge } from '@/components/dashboard/health-badge'
import { buttonVariants } from '@/components/ui/button'
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { dueDateLabel, nextStepDue } from '@/lib/next-step-due'
import { ACTIVITY_TYPE_LABELS, type ActivityType } from '@/lib/schedule'
import { HEALTH_LABELS, type HealthLevel } from '@/lib/project-health'
import type { JobSummary } from '@/lib/priority-jobs'
import type { StageActivities } from '@/lib/stage-activities'
import { stageIndicatorColor } from '@/lib/stage-colors'
import { cn } from '@/lib/utils'
import { DUE_SOON_DAYS, type DueGroupId } from '@/lib/priority-job-groups'

export type PriorityJob = {
  id: string
  name: string
  projectNumber: string | null
  status: ProjectStatus
  managerName: string | null
  /** Approved contract value; null when not established or not permitted. */
  contractCents: number | null
  health: HealthLevel | null
  /** The assessment's own reasons for this project's health result. */
  healthReasons?: readonly string[]
  /** Activities in the current stage; null when scheduling is off or the stage has no working schedule. */
  stageActivities: StageActivities | null
  /** Completed jobs remain listed only with a verified open action item; this is its title. */
  closeoutReason?: string | null
  /** That same action item's own deadline (YYYY-MM-DD), when it carries one. */
  closeoutDueOn?: string | null
  /** That same action item's own record. */
  closeoutHref?: string | null
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

export function HealthCell({ job }: { job: PriorityJob }) {
  const key = job.health ?? (job.status === 'completed' ? 'closed' : 'not_assessed')
  return (
    <HealthBadge
      healthKey={key}
      reasons={job.health ? job.healthReasons : undefined}
      label={key === 'insufficient_data' ? 'Limited Data' : undefined}
    />
  )
}

function shortDate(value: string): string {
  return formatDate(value).replace(/,\s*\d{4}$/, '')
}

function stageLabel(status: ProjectStatus): string {
  return PROJECT_STATUS_LABELS[status] ?? status
}

function activityHref(jobId: string, activityId: string) {
  return `/projects/${jobId}/schedule?activity=${encodeURIComponent(activityId)}`
}

function JobIdentity({ job }: { job: PriorityJob }) {
  const meta = [job.projectNumber, job.managerName && `PM ${job.managerName}`].filter(Boolean).join(' · ')
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <Link
        href={`/projects/${job.id}`}
        className={cn(
          'break-words text-sm font-semibold leading-snug text-foreground underline-offset-2 hover:text-[#006B7E] hover:underline',
          focusRing,
        )}
      >
        {job.name}
      </Link>
      <span className="break-words text-xs text-muted-foreground">{meta || 'No job ID or PM'}</span>
    </div>
  )
}

/** Same destination the row chevron used: the project overview. */
function ViewProjectLink({ job }: { job: PriorityJob }) {
  return (
    <Link
      href={`/projects/${job.id}`}
      aria-label={`View project ${job.name}`}
      className={buttonVariants({ variant: 'view', className: 'h-auto min-h-9 gap-1 rounded-md px-3 text-xs font-semibold' })}
    >
      View
      <ArrowRight className="size-3.5" aria-hidden="true" />
    </Link>
  )
}

/** Stage name plus a thin bar of activities complete within the current stage only. */
export function CurrentStage({ job }: { job: PriorityJob }) {
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

/**
 * Next actionable activity for the current stage. `full` (tablet Job Focus) includes the activity's date line;
 * `table` (dashboard Priority Jobs) leaves dates to the Due column and lets long titles wrap.
 */
export function NextActivity({ job, variant = 'full' }: { job: PriorityJob; variant?: 'full' | 'table' }) {
  const data = job.stageActivities
  const inTable = variant === 'table'
  const muted = (text: string) => <span className="text-xs text-muted-foreground">{text}</span>
  if (job.closeoutReason)
    return (
      <div className="flex min-w-0 flex-col gap-0.5">
        {job.closeoutHref ? (
          <Link
            href={job.closeoutHref}
            title={job.closeoutReason}
            className={cn(
              'relative z-10 text-sm text-foreground underline-offset-2 hover:text-primary hover:underline',
              inTable ? 'break-words' : 'truncate',
              focusRing,
            )}
          >
            {job.closeoutReason}
          </Link>
        ) : (
          <span className={cn('text-sm text-foreground', inTable ? 'break-words' : 'truncate')} title={job.closeoutReason}>
            {job.closeoutReason}
          </span>
        )}
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
  const href = activityHref(job.id, activity.id)
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <Link
        href={href}
        title={inTable ? undefined : activity.name}
        className={cn(
          'relative z-10 break-words text-sm text-foreground underline-offset-2 hover:text-primary hover:underline',
          !inTable && 'line-clamp-2',
          focusRing,
        )}
      >
        {activity.name}
        {typeLabel && <span className="text-muted-foreground">{` · ${typeLabel}`}</span>}
      </Link>
      {data.state === 'blocked' ? (
        <span className="text-xs font-medium text-warning">Waiting on a predecessor</span>
      ) : inTable ? null : activity.dueOn ? (
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
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {muted('No due date')}
          {job.canSetUpSchedule && (
            <Link
              href={href}
              aria-label={`Set date for ${activity.name}`}
              className={cn('relative z-10 text-xs font-medium text-primary underline-offset-2 hover:underline', focusRing)}
            >
              Set date
            </Link>
          )}
        </span>
      )}
    </div>
  )
}

/** Date of the exact record shown in Next step. Overdue styling comes only from that record's existing overdue flag. */
function DueCell({ job, today }: { job: PriorityJob; today: string }) {
  const due = nextStepDue(job)
  if (due.kind === 'none')
    return (
      <span className="text-sm text-muted-foreground">
        <span aria-hidden="true">—</span>
        <span className="sr-only">No next step</span>
      </span>
    )
  if (due.kind === 'unscheduled') {
    const activityName = job.stageActivities && 'activity' in job.stageActivities ? job.stageActivities.activity.name : null
    return (
      <div className="flex flex-col items-start gap-0.5">
        <span className="text-xs text-muted-foreground">Not scheduled</span>
        {due.activityId && activityName && job.canSetUpSchedule && (
          <Link
            href={activityHref(job.id, due.activityId)}
            aria-label={`Set date for ${activityName}`}
            className={cn('text-xs font-medium text-[#007F95] underline-offset-2 hover:text-[#006B7E] hover:underline', focusRing)}
          >
            Set date
          </Link>
        )}
      </div>
    )
  }
  const { text, isToday } = dueDateLabel(due.dueOn, today)
  const fullDate = formatDate(due.dueOn.slice(0, 10))
  if (due.overdue || due.dueOn.slice(0, 10) < today)
    return (
      <span className="tabular inline-flex items-center gap-1 text-sm font-medium text-destructive">
        <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
        <span>
          {text}
          <span className="block text-xs font-medium">Overdue</span>
        </span>
      </span>
    )
  return (
    <time
      dateTime={due.dueOn.slice(0, 10)}
      title={isToday ? fullDate : undefined}
      className={cn('tabular text-sm', isToday ? 'font-semibold text-[#B54708]' : 'text-foreground')}
    >
      {text}
    </time>
  )
}

export type PriorityJobGroup = {
  id: DueGroupId
  /** Every project in the group, before the display limit. */
  total: number
  jobs: PriorityJob[]
  expanded: boolean
  showAllHref: string
  showFewerHref: string
}

const GROUP_META: Record<DueGroupId, { label: string; hint?: string; empty: string; tone: string; dot: string }> = {
  overdue: { label: 'Overdue', empty: 'Nothing overdue.', tone: 'text-destructive', dot: 'bg-destructive' },
  today: { label: 'Due today', empty: 'Nothing due today.', tone: 'text-[#B54708]', dot: 'bg-[#B54708]' },
  soon: { label: 'Due soon', hint: `Next ${DUE_SOON_DAYS} days`, empty: `Nothing due in the next ${DUE_SOON_DAYS} days.`, tone: 'text-foreground', dot: 'bg-[#007F95]' },
  unscheduled: { label: 'Not scheduled', hint: 'Next step has no date', empty: 'Every next step has a date.', tone: 'text-foreground', dot: 'bg-muted-foreground' },
}

const COLUMN_WIDTHS = ['w-[27%]', 'w-[17%]', '', 'w-[12%]', 'w-[15%]', 'w-[5.5rem]']
const COLUMNS = ['Project', 'Stage', 'Next step', 'Due', 'Health', 'Actions']

function ColGroup() {
  return (
    <colgroup>
      {COLUMN_WIDTHS.map((w, i) => (
        <col key={i} className={w} />
      ))}
    </colgroup>
  )
}

function GroupRows({ jobs, today }: { jobs: PriorityJob[]; today: string }) {
  const cell = 'border-b border-[#D6DDE5] px-3 py-2.5 group-last/row:border-b-0'
  return (
    <>
      <table className="hidden w-full table-fixed border-separate border-spacing-0 text-left text-sm @2xl:table">
        <ColGroup />
        <thead className="sr-only">
          <tr>
            {COLUMNS.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className="group/row align-top transition-colors hover:bg-[#E5F5F7]">
              <td className={cell}>
                <JobIdentity job={job} />
              </td>
              <td className={cell}>
                <CurrentStage job={job} />
              </td>
              <td className={cell}>
                <NextActivity job={job} variant="table" />
              </td>
              <td className={cell}>
                <DueCell job={job} today={today} />
              </td>
              <td className={cell}>
                <HealthCell job={job} />
              </td>
              <td className={cn(cell, 'py-2 text-right align-middle')}>
                <ViewProjectLink job={job} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="flex flex-col divide-y divide-[#D6DDE5] @2xl:hidden">
        {jobs.map((job) => (
          <li key={job.id} className="flex flex-col gap-3 px-1 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <JobIdentity job={job} />
              <ViewProjectLink job={job} />
            </div>
            <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-2.5">
              <dt className="pt-0.5 text-xs text-muted-foreground">Stage</dt>
              <dd className="min-w-0">
                <CurrentStage job={job} />
              </dd>
              <dt className="pt-0.5 text-xs text-muted-foreground">Next step</dt>
              <dd className="min-w-0">
                <NextActivity job={job} variant="table" />
              </dd>
              <dt className="pt-0.5 text-xs text-muted-foreground">Due</dt>
              <dd className="min-w-0">
                <DueCell job={job} today={today} />
              </dd>
              <dt className="pt-0.5 text-xs text-muted-foreground">Health</dt>
              <dd className="min-w-0">
                <HealthCell job={job} />
              </dd>
            </dl>
          </li>
        ))}
      </ul>
    </>
  )
}

function DueGroupSection({ group, today }: { group: PriorityJobGroup; today: string }) {
  const meta = GROUP_META[group.id]
  const headingId = `priority-jobs-${group.id}`
  const limited = group.total > group.jobs.length
  /** Not scheduled starts collapsed so dated work leads; any group the user expanded stays open. */
  const open = group.expanded || (group.id !== 'unscheduled' && group.total > 0)
  return (
    <details open={open} className="group/due border-b border-[#D6DDE5] last:border-b-0">
      <summary
        className={cn(
          'flex min-h-11 cursor-pointer list-none items-center gap-2 px-1 py-2 [&::-webkit-details-marker]:hidden',
          focusRing,
        )}
      >
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open/due:rotate-90"
          aria-hidden="true"
        />
        <span className={cn('size-2 shrink-0 rounded-full', group.total ? meta.dot : 'bg-[#D6DDE5]')} aria-hidden="true" />
        <h3 id={headingId} className={cn('text-sm font-semibold', group.total ? meta.tone : 'text-muted-foreground')}>
          {meta.label}
        </h3>
        <span className="tabular rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {group.total}
          <span className="sr-only">{group.total === 1 ? ' project' : ' projects'}</span>
        </span>
        {meta.hint && <span className="text-xs text-muted-foreground">{meta.hint}</span>}
      </summary>
      <div role="group" aria-labelledby={headingId} className="pb-2">
        {group.total === 0 ? (
          <p className="px-7 pb-1 text-sm text-muted-foreground">{meta.empty}</p>
        ) : (
          <>
            <GroupRows jobs={group.jobs} today={today} />
            {(limited || group.expanded) && (
              <div className="flex items-center justify-end gap-2 px-3 pt-1.5 text-xs text-muted-foreground">
                <span className="tabular">
                  Showing {group.jobs.length} of {group.total}
                </span>
                <span aria-hidden="true">·</span>
                <Link
                  href={group.expanded ? group.showFewerHref : group.showAllHref}
                  scroll={false}
                  className={cn('font-medium text-primary underline-offset-2 hover:underline', focusRing)}
                >
                  {group.expanded ? 'Show fewer' : `Show all ${meta.label.toLowerCase()}`}
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </details>
  )
}

export function PriorityJobs({
  groups,
  laterCount,
  today,
  unavailable = false,
}: {
  groups: PriorityJobGroup[]
  laterCount: number
  today: string
  unavailable?: boolean
}) {
  const grouped = groups.reduce((n, g) => n + g.total, 0)
  return (
    <section aria-labelledby="priority-jobs-heading" className="surface flex flex-col">
      <DashboardSectionHeader
        compact
        className="rounded-t-[inherit] border-b border-[#D6DDE5] bg-card px-4 py-3 md:px-6"
        id="priority-jobs-heading"
        title="Priority Jobs"
        description="Grouped by when each project's next step is due"
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
      <div className="flex flex-col rounded-b-[inherit] bg-card px-3 pb-3 pt-3 md:px-4 md:pb-4">
        {unavailable ? (
          <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">Priority jobs could not be loaded.</p>
        ) : grouped === 0 && laterCount === 0 ? (
          <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">No projects yet.</p>
        ) : (
          /* Container query: the table needs the card itself to be wide, regardless of viewport. */
          <div className="@container">
            <table aria-hidden="true" className="hidden w-full table-fixed border-separate border-spacing-0 text-left @2xl:table">
              <ColGroup />
              <thead>
                <tr className="text-xs text-muted-foreground">
                  {COLUMNS.map((c, i) => (
                    <th
                      key={c}
                      className={cn(
                        'bg-muted px-3 py-2 font-medium',
                        i === 0 && 'rounded-l-md',
                        i === COLUMNS.length - 1 && 'rounded-r-md text-right',
                      )}
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
            </table>
            <div className="mt-1 flex flex-col">
              {groups.map((g) => (
                <DueGroupSection key={g.id} group={g} today={today} />
              ))}
            </div>
            {laterCount > 0 && (
              <p className="mt-2 rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
                {laterCount} more {laterCount === 1 ? 'project has its' : 'projects have their'} next step more than{' '}
                {DUE_SOON_DAYS} days out.{' '}
                <Link href="/projects" className={cn('font-medium text-primary underline-offset-2 hover:underline', focusRing)}>
                  View All Jobs
                </Link>
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
