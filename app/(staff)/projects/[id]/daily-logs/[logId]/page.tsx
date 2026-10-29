import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ClipboardList, FileDown, Pencil } from 'lucide-react'
import { getDailyLog, getDailyLogChildren, getScheduleActivityOptions, requireDailyLogProject } from '@/lib/daily-logs-data'
import { canEditDailyLog, dailyLogPrintPath, dailyLogsPath } from '@/lib/daily-logs'
import { formatDate, formatDateTime } from '@/lib/format'
import { PageHeader, SectionHeading, Surface } from '@/components/shared/page-header'
import { DailyLogReport, DailyLogStatusBadge } from '@/components/daily-logs/daily-log-report'
import { DailyLogPhotos } from '@/components/daily-logs/daily-log-photos'
import { FinalizeDailyLog } from '@/components/daily-logs/finalize-daily-log'
import { buttonVariants } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Daily log' }

export default async function DailyLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; logId: string }>
  searchParams: Promise<{ saved?: string }>
}) {
  const [{ id, logId }, { saved }] = await Promise.all([params, searchParams])
  const { project } = await requireDailyLogProject(id)
  const log = await getDailyLog(project.id, logId)
  if (!log) notFound()
  const [children, activities] = await Promise.all([getDailyLogChildren(log.id), getScheduleActivityOptions(project.id)])
  const linked = activities.filter((a) => children.activityIds.includes(a.id))
  const editable = canEditDailyLog(log.status, Boolean(project.archived_at))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Daily log: ${formatDate(log.log_date)}`}
        eyebrow={<DailyLogStatusBadge status={log.status} />}
        description={project.name}
        icon={ClipboardList}
        backHref={dailyLogsPath(project.id)}
        backLabel="Daily logs"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={dailyLogPrintPath(log.id)} className={buttonVariants({ variant: 'outline' })} target="_blank" rel="noopener">
              <FileDown className="size-4" aria-hidden="true" />
              PDF
            </Link>
            {editable && (
              <Link href={`${dailyLogsPath(project.id)}/${log.id}/edit`} className={buttonVariants()}>
                <Pencil className="size-4" aria-hidden="true" />
                Edit
              </Link>
            )}
          </div>
        }
      />

      {saved === '1' && (
        <p role="status" className="rounded-lg border border-primary/20 bg-sage px-4 py-3 text-sm text-primary">
          Draft saved.
        </p>
      )}

      {log.status === 'finalized' ? (
        <p className="text-sm text-muted-foreground">Finalized {formatDateTime(log.finalized_at)}. This log can no longer be edited.</p>
      ) : project.archived_at ? (
        <p className="text-sm text-muted-foreground">This project is archived, so this draft is read-only.</p>
      ) : null}

      <Surface>
        <DailyLogReport log={log} crews={children.crews} activities={linked} />
      </Surface>

      <Surface aria-labelledby="daily-log-photos">
        <SectionHeading id="daily-log-photos" title="Photos" description="Site photos for this day. Visible to project staff only." />
        <DailyLogPhotos projectId={project.id} logId={log.id} photos={children.photos} editable={editable} />
      </Surface>

      {editable && (
        <Surface aria-labelledby="finalize-heading">
          <SectionHeading id="finalize-heading" title="Finalize" description="Lock this log as the permanent record for the day." />
          <FinalizeDailyLog projectId={project.id} logId={log.id} version={log.version} />
        </Surface>
      )}
    </div>
  )
}
