import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ArchitecturalPlaceholder } from '@/components/projects/project-card'
import { CoverImage } from '@/components/projects/cover-image'
import { ProgressBar } from '@/components/shared/progress'
import { ProjectStatusBadge } from '@/components/shared/status-badge'
import { buildPanel, type CompactProjectCardData } from '@/components/dashboard/compact-project-card'
import { formatDate } from '@/lib/format'
import { coverAlt } from '@/lib/project-cover'
import { cn } from '@/lib/utils'

export type ProjectTableRow = CompactProjectCardData & {
  target_completion_date: string | null
  managerName: string | null
}

const TH = 'h-10 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wide text-[#64756D]'

const PANEL_TEXT = {
  neutral: 'text-foreground',
  danger: 'text-red-800',
  success: 'text-green-800',
} as const

function dateCell(p: ProjectTableRow) {
  if (p.status === 'completed') {
    return { label: 'Completed', value: p.completion_date ? formatDate(p.completion_date) : 'Date not recorded' }
  }
  return { label: 'Target', value: p.target_completion_date ? formatDate(p.target_completion_date) : 'Not set' }
}

export function ProjectTable({ rows }: { rows: ProjectTableRow[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#E2E8E2] bg-card shadow-[0_1px_2px_rgba(16,59,39,0.04)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[72rem] text-sm">
          <caption className="sr-only">Projects</caption>
          <thead className="border-b border-[#E2E8E2] bg-[#F8F7F3]">
            <tr>
              <th scope="col" className={TH}>Project</th>
              <th scope="col" className={TH}>Location</th>
              <th scope="col" className={TH}>Status</th>
              <th scope="col" className={TH}>Progress</th>
              <th scope="col" className={TH}>Project manager</th>
              <th scope="col" className={TH}>Target / completion</th>
              <th scope="col" className={TH}>Next action</th>
              <th scope="col" className={`${TH} text-right`}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8E2]">
            {rows.map((p) => {
              const href = `/projects/${p.id}`
              const showProgress = p.details.hasSchedule && p.status !== 'completed' && p.progress_percent !== null
              const progress = showProgress ? Math.round(Number(p.progress_percent)) : null
              const panel = buildPanel(p)
              const date = dateCell(p)
              return (
                <tr key={p.id} className="transition-colors hover:bg-[#F8F7F3]/70">
                  <td className="px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="relative aspect-[4/3] w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                        {p.photoUrl ? (
                          <CoverImage
                            src={p.photoUrl}
                            alt={coverAlt(p.photoKind, p.name)}
                            className="size-full object-cover"
                            fallback={<ArchitecturalPlaceholder className="size-full bg-brand-deep" />}
                          />
                        ) : (
                          <ArchitecturalPlaceholder className="size-full bg-brand-deep" />
                        )}
                      </div>
                      <div className="flex min-w-0 flex-col">
                        <Link href={href} className="line-clamp-2 font-medium text-foreground hover:text-primary hover:underline">
                          {p.name}
                        </Link>
                        <span className="font-mono text-xs text-muted-foreground">{p.project_number}</span>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{`${p.city}, ${p.state}`}</td>
                  <td className="px-4 py-3">
                    <ProjectStatusBadge status={p.status} />
                  </td>
                  <td className="w-40 px-4 py-3">
                    {progress !== null ? (
                      <div className="flex items-center gap-2">
                        <ProgressBar value={progress} label={`${p.name} construction progress`} size="sm" className="flex-1" />
                        <span className="tabular w-9 text-right text-xs font-semibold text-foreground">{`${progress}%`}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {p.status === 'completed' ? 'Construction complete' : 'No schedule yet'}
                      </span>
                    )}
                  </td>
                  <td className={cn('px-4 py-3', p.managerName ? 'text-foreground' : 'text-muted-foreground')}>
                    {p.managerName ?? 'Unassigned'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground">{date.label}</span>
                      <span className="text-foreground">{date.value}</span>
                    </div>
                  </td>
                  <td className="max-w-64 px-4 py-3">
                    <div className="flex min-w-0 flex-col">
                      {panel.href ? (
                        <Link href={panel.href} className={cn('line-clamp-2 font-medium hover:underline', PANEL_TEXT[panel.tone])}>
                          {panel.title}
                        </Link>
                      ) : (
                        <span className={cn('line-clamp-2 font-medium', PANEL_TEXT[panel.tone])}>{panel.title}</span>
                      )}
                      {panel.meta && <span className="line-clamp-1 text-xs text-muted-foreground">{panel.meta}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="outline" size="sm" render={<Link href={href} aria-label={`View project ${p.name}`} />} nativeButton={false}>
                      View
                      <ArrowRight data-icon="inline-end" />
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
