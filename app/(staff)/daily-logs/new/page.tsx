import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ClipboardList } from 'lucide-react'
import { requireStaff } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { getDailyLogProjectOptions } from '@/lib/daily-logs-data'
import { DAILY_LOG_DIRECTORY_PATH, dailyLogsPath } from '@/lib/daily-logs'
import { EmptyState, PageHeader, Surface } from '@/components/shared/page-header'
import { Button, buttonVariants } from '@/components/ui/button'

export const metadata: Metadata = { title: 'New daily log' }

export default async function ChooseDailyLogProjectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireStaff()
  await requireFeature(session.organizationId, 'daily_logs')
  const { project: selected } = await searchParams
  const projects = (await getDailyLogProjectOptions(session.organizationId)).filter((p) => !p.archived_at)

  // The project-level page re-checks access, the feature switch, and archive state before anything is saved.
  if (typeof selected === 'string' && projects.some((p) => p.id === selected)) {
    redirect(`${dailyLogsPath(selected)}/new`)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="New daily log"
        description="Daily logs belong to a project. Choose the project you are recording site activity for."
        icon={ClipboardList}
        backHref={DAILY_LOG_DIRECTORY_PATH}
        backLabel="Daily logs"
      />

      {projects.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No active projects available"
          description="You can record a daily log once you are assigned to an active project."
        />
      ) : (
        <Surface>
          <form method="get" className="flex max-w-xl flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-foreground">Project</span>
              <select name="project" required defaultValue="" className="h-11 rounded-md border border-input bg-background px-3 text-sm">
                <option value="" disabled>
                  Select a project
                </option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.project_number ? ` · ${p.project_number}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <Button type="submit" className="h-11">
                Continue
              </Button>
              <Link href={DAILY_LOG_DIRECTORY_PATH} className={buttonVariants({ variant: 'ghost', className: 'h-11' })}>
                Cancel
              </Link>
            </div>
          </form>
        </Surface>
      )}
    </div>
  )
}
