import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ClipboardList } from 'lucide-react'
import { getCrewCompanyOptions, getOrgToday, getScheduleActivityOptions, requireDailyLogProject } from '@/lib/daily-logs-data'
import { addDays, dailyLogsPath } from '@/lib/daily-logs'
import { PageHeader } from '@/components/shared/page-header'
import { DailyLogForm, type DailyLogFormDefaults } from '@/components/daily-logs/daily-log-form'

export const metadata: Metadata = { title: 'New daily log' }

export default async function NewDailyLogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { session, project } = await requireDailyLogProject(id)
  if (project.archived_at) redirect(dailyLogsPath(project.id))
  const [today, activities, companies] = await Promise.all([
    getOrgToday(session.organizationId),
    getScheduleActivityOptions(project.id),
    getCrewCompanyOptions(session.organizationId, project.id),
  ])

  const defaults: DailyLogFormDefaults = {
    log_date: today,
    temperature_f: '',
    crews: [],
    activityIds: [],
    weather_conditions: '',
    weather_impact: '',
    site_conditions: '',
    work_performed: '',
    progress_notes: '',
    work_planned_next: '',
    materials_delivered: '',
    equipment_used: '',
    delivery_notes: '',
    delay_description: '',
    delay_reason: '',
    delay_impact: '',
    corrective_actions: '',
    safety_observations: '',
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="New daily log" description={`Record today's site activity for ${project.name}.`} icon={ClipboardList} backHref={dailyLogsPath(project.id)} backLabel="Daily logs" />
      <DailyLogForm projectId={project.id} defaults={defaults} activities={activities} companies={companies} maxDate={addDays(today, 1)} cancelHref={dailyLogsPath(project.id)} />
    </div>
  )
}
