import { History } from 'lucide-react'
import type { PresentedEvent } from '@/lib/activity-history'
import { CompactHistoryItem } from '@/components/schedule/activity-history-item'
import { ActivityHistoryDrawer } from '@/components/schedule/activity-history-drawer'

export function ActivityHistoryCard({
  events,
  failed,
  project,
  actorOptions,
  canExport,
}: {
  events: PresentedEvent[]
  failed: boolean
  project: { id: string; name: string; project_number: string | null }
  actorOptions: { value: string; label: string }[]
  canExport: boolean
}) {
  return (
    <section aria-labelledby="schedule-history" className="flex flex-col overflow-hidden rounded-xl border border-[#E2E8E2] bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8E2] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-lg bg-[#EAF0E9] text-[#174D32]">
            <History className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <h2 id="schedule-history" className="font-serif text-lg font-semibold leading-tight text-[#103B27]">
              Activity History
            </h2>
            <p className="text-xs text-muted-foreground">Most recent schedule changes</p>
          </div>
        </div>
        <ActivityHistoryDrawer project={project} actorOptions={actorOptions} canExport={canExport} />
      </header>

      {failed ? (
        <p role="alert" className="px-4 py-6 text-sm text-muted-foreground">
          Recent activity could not be loaded. Refresh the page to try again.
        </p>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-start gap-1 px-4 py-6">
          <p className="text-sm font-medium text-[#103B27]">No activity recorded yet</p>
          <p className="text-sm text-muted-foreground">Changes to schedule activities will appear here as they happen.</p>
        </div>
      ) : (
        <ol className="flex flex-col divide-y divide-[#E2E8E2]">
          {events.map((e) => (
            <CompactHistoryItem key={e.id} event={e} />
          ))}
        </ol>
      )}
    </section>
  )
}
