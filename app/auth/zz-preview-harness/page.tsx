// TEMPORARY verification harness. Not part of the app; removed before commit.
import { cookies } from 'next/headers'
import { DirectoryViews } from '@/components/shared/directory-views'
import { ProjectTable, type ProjectTableRow } from '@/components/projects/project-table'
import { ProjectPreviewLayout } from '@/components/projects/project-preview-layout'
import { ProjectColumns, ProjectColumnsMenu } from '@/components/projects/project-columns'
import { CompactProjectCard } from '@/components/dashboard/compact-project-card'
import { PROJECT_COLUMNS_COOKIE, parseProjectColumns } from '@/lib/project-columns'
import { DIRECTORY_VIEW_COOKIE, parseView } from '@/lib/directory'
import { HarnessMock } from './mock'

const P = (n: number) => `00000000-0000-4000-8000-00000000000${n}`
const details = (over: Record<string, unknown> = {}) =>
  ({
    scheduleEnabled: true,
    hasSchedule: true,
    undatedOpenCount: 0,
    activityCount: 12,
    nextActivity: { id: 'a1', name: 'Rough electrical inspection', dueOn: '2026-03-06' },
    overdueActivity: null,
    behindSchedule: false,
    holdReason: null,
    warranty: null,
    openClaim: null,
    openClaimCount: 0,
    estimate: null,
    loadError: false,
    stageActivities: null,
    ...over,
  }) as unknown as ProjectTableRow['details']

const row = (n: number, name: string, over: Partial<ProjectTableRow> = {}): ProjectTableRow => ({
  id: P(n),
  project_number: `BJ-2026-00${n}`,
  name,
  status: 'under_construction' as ProjectTableRow['status'],
  project_type: 'new_custom_home',
  city: 'Flagstaff',
  state: 'AZ',
  locationLabel: 'Flagstaff, AZ',
  progress_percent: 42,
  completion_date: null,
  target_completion_date: '2026-09-30',
  photoUrl: null,
  details: details(),
  warrantyEnabled: true,
  canPlanSchedule: true,
  managerName: 'Dana Ortiz',
  ...over,
})

export default async function Harness({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const jar = await cookies()
  const { view } = await searchParams
  const rows = [
    row(1, 'Lee-Montgomery Residence at Whispering Pines'),
    row(2, 'Vale Cottage', { managerName: null, details: details({ undatedOpenCount: 6, nextActivity: null }) }),
    row(3, 'Canyon Road Remodel', { status: 'completed' as ProjectTableRow['status'], completion_date: '2026-01-15', project_type: 'remodel' }),
    row(4, 'Broken Preview House'),
  ]
  const statuses = new Set(rows.map((r) => r.status))
  return (
    <div className="mx-auto flex max-w-[1700px] flex-col gap-4 p-6" data-statuses={[...statuses].join(',')}>
      <HarnessMock />
      <h1 className="font-serif text-xl">Projects (harness)</h1>
      <ProjectPreviewLayout projects={rows.map((p) => ({ id: p.id, name: p.name, project_number: p.project_number }))}>
        <ProjectColumns initial={parseProjectColumns(jar.get(PROJECT_COLUMNS_COOKIE)?.value)}>
          <DirectoryViews
            module="projects"
            initialView={parseView(view) ?? parseView(jar.get(DIRECTORY_VIEW_COOKIE.projects)?.value)}
            desktopDefault="cards"
            summary={`Showing 1–${rows.length} of ${rows.length} projects`}
            controls={<ProjectColumnsMenu />}
            table={<ProjectTable rows={rows} />}
            cards={
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 xl:group-data-preview-open/preview:grid-cols-1 xl:group-data-preview-open/preview:@2xl:grid-cols-2 xl:group-data-preview-open/preview:@5xl:grid-cols-3">
                {rows.map((r) => (
                  <CompactProjectCard key={r.id} project={r} showType preview />
                ))}
              </div>
            }
          />
        </ProjectColumns>
        <div style={{ height: 900 }} aria-hidden="true" />
      </ProjectPreviewLayout>
    </div>
  )
}
