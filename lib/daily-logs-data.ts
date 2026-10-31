import 'server-only'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireStaff, type StaffSession } from '@/lib/session'
import { getOrgFeatures, requireFeature } from '@/lib/features'
import { signMediaPaths } from '@/lib/media'
import { isDailyLogStatus, todayInTimeZone, type DailyLogStatus } from '@/lib/daily-logs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type DailyLogProject = {
  id: string
  name: string
  project_number: string | null
  archived_at: string | null
}

export type DailyLogRecord = {
  id: string
  project_id: string
  log_date: string
  status: DailyLogStatus
  version: number
  author_id: string | null
  weather_conditions: string | null
  temperature_f: number | null
  weather_source: string
  weather_impact: string | null
  site_conditions: string | null
  work_performed: string | null
  progress_notes: string | null
  work_planned_next: string | null
  materials_delivered: string | null
  equipment_used: string | null
  delivery_notes: string | null
  delay_description: string | null
  delay_reason: string | null
  delay_impact: string | null
  corrective_actions: string | null
  safety_observations: string | null
  has_delays: boolean
  finalized_at: string | null
  finalized_by: string | null
  created_at: string
  updated_at: string
}

export type DailyLogCrew = {
  id: string
  trade: string
  crew_size: number | null
  hours_worked: number | null
  notes: string | null
  subcontractor_company_id: string | null
  company_name: string | null
}
export type CrewCompanyOption = { id: string; company_name: string; trade: string; assigned?: boolean }

/**
 * Active subcontractors for the crew picker. Empty when the module is off or its table is not set up yet.
 * When a project is given, companies with an active schedule assignment on it are flagged so the picker can list them first.
 */
export async function getCrewCompanyOptions(organizationId: string, projectId?: string): Promise<CrewCompanyOption[]> {
  const features = await getOrgFeatures(organizationId)
  if (!features.subcontractors) return []
  const supabase = await createClient()
  const [{ data, error }, assignments] = await Promise.all([
    supabase
      .from('subcontractor_companies')
      .select('id, company_name, trade')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .order('company_name')
      .limit(500),
    projectId && features.schedule
      ? supabase
          .from('schedule_activity_assignments')
          .select('subcontractor_company_id')
          .eq('organization_id', organizationId)
          .eq('project_id', projectId)
          .eq('status', 'active')
          .limit(1000)
      : Promise.resolve({ data: [] as { subcontractor_company_id: string }[] }),
  ])
  if (error) return []
  const assignedIds = new Set((assignments.data ?? []).map((a) => a.subcontractor_company_id))
  return ((data ?? []) as CrewCompanyOption[]).map((c) => ({ ...c, assigned: assignedIds.has(c.id) }))
}
export type DailyLogPhoto = { id: string; storage_path: string; file_name: string; caption: string | null; created_at: string; url: string | null }
export type ScheduleActivityOption = { id: string; name: string; phase: string | null; status: string | null }

/** Guards every Daily Log route: staff session, the module switch, and internal access to this project (RLS-scoped). */
export const requireDailyLogProject = cache(async (projectId: string): Promise<{ session: StaffSession; project: DailyLogProject }> => {
  const session = await requireStaff()
  await requireFeature(session.organizationId, 'daily_logs')
  if (!UUID.test(projectId)) notFound()
  const supabase = await createClient()
  const [{ data: project }, { data: canView }] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, project_number, archived_at')
      .eq('id', projectId)
      .eq('organization_id', session.organizationId)
      .maybeSingle(),
    supabase.rpc('can_view_project_internal', { p_project: projectId }),
  ])
  if (!project || !canView) notFound()
  return { session, project: project as DailyLogProject }
})

/** Projects the signed-in staff member can see (RLS-scoped, same rule as can_view_project_internal). */
export const getDailyLogProjectOptions = cache(async (organizationId: string): Promise<DailyLogProject[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, project_number, archived_at')
    .eq('organization_id', organizationId)
    .order('name')
    .limit(500)
  if (error) return []
  return (data ?? []) as DailyLogProject[]
})

export const getOrgTimeZone = cache(async (organizationId: string): Promise<string> => {
  const supabase = await createClient()
  const { data } = await supabase.from('organization_settings').select('timezone').eq('organization_id', organizationId).maybeSingle()
  return data?.timezone ?? 'America/Chicago'
})

export const getOrgToday = cache(async (organizationId: string) => todayInTimeZone(await getOrgTimeZone(organizationId)))

const LOG_COLUMNS =
  'id, project_id, log_date, status, version, author_id, weather_conditions, temperature_f, weather_source, weather_impact, site_conditions, work_performed, progress_notes, work_planned_next, materials_delivered, equipment_used, delivery_notes, delay_description, delay_reason, delay_impact, corrective_actions, safety_observations, has_delays, finalized_at, finalized_by, created_at, updated_at'

export async function getDailyLog(projectId: string, logId: string) {
  if (!UUID.test(logId)) return null
  const supabase = await createClient()
  const { data } = await supabase.from('daily_logs').select(LOG_COLUMNS).eq('id', logId).eq('project_id', projectId).maybeSingle()
  if (!data || !isDailyLogStatus(data.status)) return null
  return data as DailyLogRecord
}

export async function getDailyLogChildren(logId: string) {
  const supabase = await createClient()
  const [{ data: crews }, { data: links }, { data: photos }] = await Promise.all([
    supabase
      .from('daily_log_crews')
      .select('id, trade, crew_size, hours_worked, notes, subcontractor_company_id, company_name')
      .eq('daily_log_id', logId)
      .order('sort_order'),
    supabase.from('daily_log_activities').select('schedule_activity_id').eq('daily_log_id', logId),
    supabase.from('daily_log_photos').select('id, storage_path, file_name, caption, created_at').eq('daily_log_id', logId).order('created_at'),
  ])
  const urls = await signMediaPaths((photos ?? []).map((p) => p.storage_path))
  return {
    crews: ((crews ?? []) as DailyLogCrew[]).map((c) => ({ ...c, hours_worked: c.hours_worked === null ? null : Number(c.hours_worked) })),
    activityIds: (links ?? []).map((l) => l.schedule_activity_id as string),
    photos: (photos ?? []).map((p) => ({ ...p, url: urls.get(p.storage_path) ?? null })) as DailyLogPhoto[],
  }
}

export async function getScheduleActivityOptions(projectId: string): Promise<ScheduleActivityOption[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('schedule_activities')
    .select('id, name, phase, status')
    .eq('project_id', projectId)
    .order('planned_start', { ascending: true, nullsFirst: false })
    .limit(300)
  return (data ?? []) as ScheduleActivityOption[]
}
