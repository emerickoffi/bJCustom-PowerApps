import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { crewTotals, isDailyLogStatus } from '@/lib/daily-logs'
import type { DailyLogPreview } from '@/lib/daily-log-preview'

type Result = { ok: true; preview: DailyLogPreview } | { ok: false; status: number; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NOT_FOUND: Result = { ok: false, status: 404, error: 'This daily log is no longer available.' }
const FORBIDDEN: Result = { ok: false, status: 403, error: 'You do not have access to this daily log.' }

const PREVIEW_COLUMNS =
  'id, project_id, log_date, status, weather_conditions, temperature_f, site_conditions, work_performed, progress_notes, work_planned_next, has_delays, delay_description, safety_observations, finalized_at'

const text = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null)

/**
 * One daily log's read-only summary, loaded only when it is selected. Access matches the Daily Log detail page:
 * active staff, the Daily Logs module on, the log in the caller's organization (RLS-scoped), and internal access
 * to its project. Photos are counted, never signed, so no file URLs leave the server here.
 */
export async function loadDailyLogPreview(logId: string): Promise<Result> {
  if (!UUID.test(logId)) return NOT_FOUND
  const session = await getSession()
  if (!session) return { ok: false, status: 401, error: 'Please sign in again.' }
  if (!session.organizationId || !session.role || session.role === 'client' || session.activationRequired) return FORBIDDEN
  const features = await getOrgFeatures(session.organizationId)
  if (!features.daily_logs) return FORBIDDEN

  const supabase = await createClient()
  const { data: log } = await supabase
    .from('daily_logs')
    .select(PREVIEW_COLUMNS)
    .eq('id', logId)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!log || !isDailyLogStatus(log.status)) return NOT_FOUND

  const [{ data: project }, { data: canView }, { data: crews }, { count: photoCount }] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, project_number')
      .eq('id', log.project_id)
      .eq('organization_id', session.organizationId)
      .maybeSingle(),
    supabase.rpc('can_view_project_internal', { p_project: log.project_id }),
    supabase.from('daily_log_crews').select('trade, crew_size, hours_worked, company_name').eq('daily_log_id', log.id).order('sort_order'),
    supabase.from('daily_log_photos').select('id', { count: 'exact', head: true }).eq('daily_log_id', log.id),
  ])
  if (!project || !canView) return FORBIDDEN

  const crewRows = (crews ?? []) as { trade: string; crew_size: number | null; hours_worked: number | string | null; company_name: string | null }[]
  const totals = crewTotals(crewRows.map((c) => ({ crew_size: c.crew_size, hours_worked: c.hours_worked === null ? null : Number(c.hours_worked) })))

  return {
    ok: true,
    preview: {
      id: log.id,
      logDate: log.log_date,
      status: log.status,
      project: { id: project.id, name: project.name, number: project.project_number || null },
      weather: text(log.weather_conditions),
      temperatureF: log.temperature_f === null ? null : Number(log.temperature_f),
      siteConditions: text(log.site_conditions),
      workPerformed: text(log.work_performed),
      progressNotes: text(log.progress_notes),
      workPlannedNext: text(log.work_planned_next),
      crews: crewRows.map((c) => ({ trade: c.trade, company: text(c.company_name), workers: c.crew_size })),
      totalWorkers: totals.workers,
      totalHours: totals.hours,
      hasDelays: Boolean(log.has_delays),
      delay: text(log.delay_description),
      safety: text(log.safety_observations),
      photoCount: photoCount ?? 0,
      finalizedAt: log.finalized_at,
    },
  }
}
