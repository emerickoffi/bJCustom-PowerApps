import Link from 'next/link'
import { ArrowRight, House } from 'lucide-react'
import { DashboardSectionHeader } from '@/components/dashboard/dashboard-section-header'
import { HealthBadge } from '@/components/dashboard/project-health'
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'
import { formatCents, formatDate } from '@/lib/format'
import type { HealthLevel } from '@/lib/project-health'
import type { JobSummary } from '@/lib/priority-jobs'
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
  summary: JobSummary
}

function StatusCell({ job }: { job: PriorityJob }) {
  if (job.health) return <HealthBadge level={job.health} />
  return (
    <span className="inline-flex w-fit rounded-full bg-muted px-2 py-0.5 text-[0.7rem] font-semibold text-muted-foreground">
      {job.status === 'completed' ? 'Closed' : 'Not assessed'}
    </span>
  )
}

function NextStep({ summary }: { summary: JobSummary }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate text-sm text-foreground">{summary.text}</span>
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        {summary.dueOn && (
          <span className={cn(summary.overdue && 'font-medium text-destructive')}>
            {`${summary.overdue ? 'Overdue · ' : ''}${formatDate(summary.dueOn)}`}
          </span>
        )}
        {summary.progress !== null && <span className="tabular">{`${summary.progress}% complete`}</span>}
      </span>
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
                <th scope="col" className="w-[30%] pb-2 font-medium">Job</th>
                <th scope="col" className="w-[14%] pb-2 font-medium">Stage</th>
                <th scope="col" className="pb-2 font-medium">Next step</th>
                {showBudget && <th scope="col" className="w-[13%] pb-2 text-right font-medium">Contract</th>}
                <th scope="col" className="w-[17%] pb-2 pl-4 font-medium">Health</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {jobs.map((job) => (
                <tr key={job.id} className="group relative align-middle hover:bg-sage/40">
                  <td className="py-3 pr-3">
                    <Link
                      href={`/projects/${job.id}`}
                      className="block truncate font-semibold text-foreground outline-none after:absolute after:inset-0 after:content-[''] group-hover:text-primary focus-visible:underline"
                    >
                      {job.name}
                    </Link>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[job.projectNumber, job.managerName && `PM ${job.managerName}`].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </td>
                  <td className="truncate py-3 pr-3 text-xs text-muted-foreground">
                    {PROJECT_STATUS_LABELS[job.status] ?? job.status}
                  </td>
                  <td className="py-3 pr-3">
                    <NextStep summary={job.summary} />
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
              <li key={job.id}>
                <Link
                  href={`/projects/${job.id}`}
                  className="flex flex-col gap-2 rounded-xl border bg-card p-3 transition-colors hover:border-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm font-semibold text-foreground">{job.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {[job.projectNumber, PROJECT_STATUS_LABELS[job.status], job.managerName && `PM ${job.managerName}`]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </div>
                    <StatusCell job={job} />
                  </div>
                  <NextStep summary={job.summary} />
                  {showBudget && job.contractCents !== null && (
                    <span className="tabular text-xs text-muted-foreground">{`Contract ${formatCents(job.contractCents)}`}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
