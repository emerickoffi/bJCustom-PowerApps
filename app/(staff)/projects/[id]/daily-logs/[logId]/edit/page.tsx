import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { ClipboardList } from 'lucide-react'
import { getCrewCompanyOptions, getDailyLog, getDailyLogChildren, getOrgToday, getScheduleActivityOptions, requireDailyLogProject } from '@/lib/daily-logs-data'
import { DAILY_LOG_TEXT_FIELDS, addDays, canEditDailyLog, dailyLogPath } from '@/lib/daily-logs'
import { formatDate } from '@/lib/format'
import { PageHeader } from '@/components/shared/page-header'
import { DailyLogForm, type DailyLogFormDefaults } from '@/components/daily-logs/daily-log-form'

export const metadata: Metadata = { title: 'Edit daily log' }

export default async function EditDailyLogPage({ params }: { params: Promise<{ id: string; logId: string }> }) {
  const { id, logId } = await params
  const { session, project } = await requireDailyLogProject(id)
  const log = await getDailyLog(project.id, logId)
  if (!log) notFound()
  const detailHref = dailyLogPath(project.id, log.id)
  if (!canEditDailyLog(log.status, Boolean(project.archived_at))) redirect(detailHref)

  const [today, activities, children, companies] = await Promise.all([
    getOrgToday(session.organizationId),
    getScheduleActivityOptions(project.id),
    getDailyLogChildren(log.id),
    getCrewCompanyOptions(session.organizationId, project.id),
  ])

  const text = Object.fromEntries(DAILY_LOG_TEXT_FIELDS.map((k) => [k, log[k] ?? ''])) as Record<(typeof DAILY_LOG_TEXT_FIELDS)[number], string>
  const defaults: DailyLogFormDefaults = {
    ...text,
    id: log.id,
    version: log.version,
    log_date: log.log_date,
    temperature_f: log.temperature_f === null ? '' : String(log.temperature_f),
    activityIds: children.activityIds,
    crews: children.crews.map((c) => ({
      trade: c.trade,
      crew_size: c.crew_size === null ? '' : String(c.crew_size),
      hours_worked: c.hours_worked === null ? '' : String(c.hours_worked),
      notes: c.notes ?? '',
      subcontractor_company_id: c.subcontractor_company_id ?? '',
      company_name: c.company_name ?? undefined,
    })),
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`Edit log for ${formatDate(log.log_date)}`} description={project.name} icon={ClipboardList} backHref={detailHref} backLabel="Back to log" />
      <DailyLogForm projectId={project.id} defaults={defaults} activities={activities} companies={companies} maxDate={addDays(today, 1)} cancelHref={detailHref} />
    </div>
  )
}
