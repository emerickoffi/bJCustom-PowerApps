import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ArchitecturalPlaceholder } from '@/components/projects/project-card'
import { CoverImage } from '@/components/projects/cover-image'
import { ProjectPreviewSurface, ProjectPreviewTrigger } from '@/components/projects/project-preview-trigger'
import { ProjectTypeLabel } from '@/components/projects/project-type-label'
import { ProgressBar } from '@/components/shared/progress'
import { ProjectStatusBadge } from '@/components/shared/status-badge'
import { buildPanel, type CompactProjectCardData } from '@/components/dashboard/compact-project-card'
import { formatDate } from '@/lib/format'
import { coverAlt } from '@/lib/project-cover'
import { formatLocation } from '@/lib/location-display'
import { cn } from '@/lib/utils'
import { DIRECTORY_TH_TEXT, DIRECTORY_THEAD_ROW } from '@/lib/directory-table-styles'

export type ProjectTableRow = CompactProjectCardData & {
  target_completion_date: string | null
  managerName: string | null
}

const TH = `${DIRECTORY_TH_TEXT} px-4 text-left align-middle tablet:px-3`
const TD = 'px-4 py-3 tablet:px-3'
/**
 * While the preview column narrows the list, columns the preview already covers step aside so the rest stay readable.
 * Widths are those of the list itself (a container query), so nothing changes unless the preview actually takes the room.
 */
const PREVIEW_HIDE = 'xl:group-data-preview-open/preview:@max-[88rem]:hidden'
const PREVIEW_HIDE_NARROW = 'xl:group-data-preview-open/preview:@max-3xl:hidden'
const PREVIEW_HIDE_NARROWEST = 'xl:group-data-preview-open/preview:@max-2xl:hidden'

const PANEL_TEXT = {
  neutral: 'text-foreground',
  danger: 'text-red-800',
  success: 'text-green-800',
  muted: 'text-muted-foreground',
} as const

const PANEL_ICON_TEXT = {
  neutral: 'text-primary',
  danger: 'text-red-600',
  success: 'text-green-700',
  muted: 'text-muted-foreground',
} as const

function dateCell(p: ProjectTableRow) {
  if (p.status === 'completed') {
    return { label: 'Completed', value: p.completion_date ? formatDate(p.completion_date) : 'Date not recorded' }
  }
  return { label: 'Target', value: p.target_completion_date ? formatDate(p.target_completion_date) : 'Not set' }
}

export function ProjectTable({ rows }: { rows: ProjectTableRow[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#D6DDE5] bg-card shadow-[0_1px_2px_rgba(16,59,39,0.04)]">
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[64rem] text-sm tablet:min-w-0 xl:group-data-preview-open/preview:@max-[88rem]:min-w-0">
          <caption className="sr-only">Projects</caption>
          <thead className={DIRECTORY_THEAD_ROW}>
            <tr>
              <th
                scope="col"
                className={`${TH} w-[26%] min-w-64 tablet:min-w-48 xl:group-data-preview-open/preview:@max-2xl:w-auto xl:group-data-preview-open/preview:@max-2xl:min-w-0`}
              >
                Project
              </th>
              <th scope="col" className={`${TH} whitespace-nowrap tablet:hidden ${PREVIEW_HIDE}`}>Location</th>
              <th scope="col" className={`${TH} whitespace-nowrap`}>Status</th>
              <th scope="col" className={`${TH} whitespace-nowrap ${PREVIEW_HIDE_NARROW}`}>Progress</th>
              <th scope="col" className={`${TH} whitespace-nowrap ${PREVIEW_HIDE}`}>Project manager</th>
              <th scope="col" className={`${TH} whitespace-nowrap ${PREVIEW_HIDE_NARROWEST}`}>Target / completion</th>
              <th scope="col" className={`${TH} w-[30%] min-w-72 tablet:min-w-56 ${PREVIEW_HIDE}`}>Next action</th>
              <th scope="col" className={`${TH} text-right`}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#D6DDE5]">
            {rows.map((p) => {
              const href = `/projects/${p.id}`
              const showProgress = p.details.hasSchedule && p.status !== 'completed' && p.progress_percent !== null
              const progress = showProgress ? Math.round(Number(p.progress_percent)) : null
              const panel = buildPanel(p)
              const date = dateCell(p)
              const location = p.locationLabel ?? formatLocation(p.city, p.state)
              return (
                <ProjectPreviewSurface
                  key={p.id}
                  as="tr"
                  projectId={p.id}
                  className="scroll-mt-24 scroll-mb-4 transition-colors hover:bg-link-soft/60 data-selected:bg-link-soft"
                >
                  <td className={TD}>
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={`relative aspect-[4/3] w-14 shrink-0 tablet:w-12 overflow-hidden rounded-md bg-muted ${PREVIEW_HIDE_NARROWEST}`}>
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
                        <ProjectPreviewTrigger
                          projectId={p.id}
                          projectName={p.name}
                          className="font-medium text-link hover:text-link-hover hover:underline"
                          labelClassName="line-clamp-2"
                        />
                        <span className="font-mono text-xs text-muted-foreground">{p.project_number}</span>
                        <ProjectTypeLabel type={p.project_type} />
                        <span className="hidden truncate text-xs text-muted-foreground tablet:block">{location}</span>
                      </div>
                    </div>
                  </td>
                  <td className={`${TD} whitespace-nowrap text-muted-foreground tablet:hidden ${PREVIEW_HIDE}`}>{location}</td>
                  <td className={`${TD} whitespace-nowrap`}>
                    <ProjectStatusBadge status={p.status} />
                  </td>
                  <td className={`${TD} w-36 tablet:w-36 ${PREVIEW_HIDE_NARROW}`}>
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
                  <td className={cn(TD, 'whitespace-nowrap', PREVIEW_HIDE, p.managerName ? 'text-foreground' : 'text-muted-foreground')}>
                    {p.managerName ?? 'Unassigned'}
                  </td>
                  <td className={`${TD} whitespace-nowrap ${PREVIEW_HIDE_NARROWEST}`}>
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground">{date.label}</span>
                      <span className="text-foreground">{date.value}</span>
                    </div>
                  </td>
                  <td className={`${TD} ${PREVIEW_HIDE}`}>
                    <div className="flex min-w-0 items-start gap-2">
                      <panel.Icon
                        className={cn('mt-0.5 size-4 shrink-0', PANEL_ICON_TEXT[panel.tone])}
                        aria-hidden="true"
                      />
                      <div className="flex min-w-0 flex-col">
                        <span className="sr-only">{panel.kind === 'action' ? 'Next action: ' : 'Status: '}</span>
                        {panel.href ? (
                          <Link
                            href={panel.href}
                            className={cn(
                              'line-clamp-2 hover:underline',
                              panel.kind === 'action' ? 'font-medium' : 'font-normal',
                              PANEL_TEXT[panel.tone],
                            )}
                          >
                            {panel.title}
                          </Link>
                        ) : (
                          <span
                            className={cn(
                              'line-clamp-2',
                              panel.kind === 'action' ? 'font-medium' : 'font-normal',
                              PANEL_TEXT[panel.tone],
                            )}
                          >
                            {panel.title}
                          </span>
                        )}
                        {panel.meta && <span className="line-clamp-2 text-xs text-muted-foreground">{panel.meta}</span>}
                      </div>
                    </div>
                  </td>
                  <td className={`${TD} whitespace-nowrap text-right`}>
                    <Button variant="view" size="sm" render={<Link href={href} aria-label={`Open project ${p.name}`} />} nativeButton={false}>
                      Open project
                      <ArrowRight data-icon="inline-end" />
                    </Button>
                  </td>
                </ProjectPreviewSurface>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
