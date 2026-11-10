// Temporary verification harness for the Projects list preview. Deleted before commit.
import { DirectoryViews } from '@/components/shared/directory-views'
import { ProjectTable, type ProjectTableRow } from '@/components/projects/project-table'
import { ProjectPreviewLayout } from '@/components/projects/project-preview-layout'
import { CompactProjectCard } from '@/components/dashboard/compact-project-card'
import type { DashboardCardDetails } from '@/lib/dashboard-cards'
import type { ProjectStatus } from '@/lib/domain'
import { MockPreviewApi } from './mock'

export const dynamic = 'force-dynamic'

const details: DashboardCardDetails = {
  scheduleEnabled: true,
  hasSchedule: true,
  scheduleNotStarted: false,
  activityCount: 12,
  nextActivity: null,
  overdueActivity: null,
  behindSchedule: false,
  holdReason: null,
  warranty: null,
  openClaim: null,
  openClaimCount: 0,
  estimate: null,
  loadError: false,
  stageActivities: null,
}

const STATUSES: ProjectStatus[] = ['planning', 'on_hold', 'completed', 'lead']

export default async function PreviewCheck({ searchParams }: { searchParams: Promise<{ count?: string }> }) {
  const { count } = await searchParams
  const total = Math.min(40, Math.max(0, Number(count ?? 12) || 0))
  const rows: ProjectTableRow[] = Array.from({ length: total }, (_, i) => {
    const n = i + 1
    return {
      id: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
      project_number: `PRJ-${String(n).padStart(4, '0')}`,
      name: n === 6 ? 'The Hawthorne Family Lakeside Custom Residence and Detached Guest House' : `Residence ${n}`,
      status: STATUSES[i % STATUSES.length],
      project_type: null,
      city: 'Austin',
      state: 'TX',
      progress_percent: 10 * (n % 10),
      completion_date: null,
      photoUrl: null,
      details,
      warrantyEnabled: false,
      target_completion_date: '2026-12-18',
      managerName: n % 3 ? 'Morgan Castellanos' : null,
    }
  })

  return (
    <div data-staff-shell className="flex min-h-svh bg-background">
      <MockPreviewApi />
      <div className="hidden w-[17rem] shrink-0 border-r bg-white xl:block" />
      <div className="flex min-w-0 flex-1 flex-col">
        <header data-app-header className="sticky top-0 z-30 flex h-14 items-center border-b bg-white px-6 sm:h-16">
          App header
        </header>
        <main className="w-full min-w-0 flex-1 px-(--page-gutter-x) pt-(--page-gutter-top) pb-36">
          <div className="flex w-full min-w-0 flex-col gap-5">
            <h1 className="text-2xl font-semibold">Projects</h1>
            <ProjectPreviewLayout projects={rows.map((p) => ({ id: p.id, name: p.name, project_number: p.project_number, status: p.status }))}>
              <div className="flex flex-col gap-4">
                <DirectoryViews
                  module="projects"
                  initialView={null}
                  desktopDefault="cards"
                  summary={`Showing ${rows.length} projects`}
                  table={<ProjectTable rows={rows} />}
                  cards={
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 xl:group-data-preview-open/preview:grid-cols-1 xl:group-data-preview-open/preview:@2xl:grid-cols-2 xl:group-data-preview-open/preview:@5xl:grid-cols-3">
                      {rows.map((row) => (
                        <CompactProjectCard
                          key={row.id}
                          project={row}
                          showType
                          preview
                          footer={
                            <div className="flex items-center gap-3 border-t pt-3 text-sm">
                              <label className="flex items-center gap-1.5">
                                <input type="checkbox" data-check={row.project_number} /> Pick
                              </label>
                              <button type="button" data-menu={row.project_number} className="rounded border px-2">
                                Menu
                              </button>
                              <span>Plain footer text</span>
                            </div>
                          }
                        />
                      ))}
                    </div>
                  }
                />
              </div>
            </ProjectPreviewLayout>
          </div>
        </main>
      </div>
    </div>
  )
}
