import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { todayIso } from '@/lib/schedule'
import {
  buildAttentionItems,
  informationalNotifications,
  type AttentionActivity,
  type AttentionDailyLogDelay,
  type AttentionItem,
  type AttentionNotification,
} from '@/lib/attention'

type ProjectRef = { name: string } | { name: string }[] | null
const projectName = (p: ProjectRef) => (Array.isArray(p) ? p[0]?.name : p?.name) ?? null

const NOTIFICATION_LIMIT = 60
const ACTIVITY_LIMIT = 20
const LOG_DELAY_LIMIT = 10
const LOG_DELAY_WINDOW_DAYS = 7

function daysBefore(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

export type DashboardAttention = {
  items: AttentionItem[]
  total: number
  totalIsLowerBound: boolean
  updates: AttentionNotification[]
}

/** Pending work for the signed-in user, read through RLS so it only covers projects they can see. */
export async function loadDashboardAttention(
  orgId: string,
  userId: string,
  features: {
    schedule: boolean
    warranty: boolean
    documents: boolean
    e_signatures: boolean
    daily_logs?: boolean
    subcontractors?: boolean
  },
): Promise<DashboardAttention> {
  const supabase = await createClient()
  const today = todayIso()
  const [notificationsRes, activitiesRes, logDelaysRes] = await Promise.all([
    supabase
      .from('notifications')
      .select('id, title, body, link, kind, action_required, dedupe_key, created_at, project_id, projects(name)')
      .eq('user_id', userId)
      .eq('organization_id', orgId)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(NOTIFICATION_LIMIT),
    features.schedule
      ? supabase
          .from('schedule_activities')
          .select('id, project_id, name, status, planned_end, projects(name)', { count: 'exact' })
          .eq('organization_id', orgId)
          .not('status', 'in', '(completed,skipped)')
          .or(`status.eq.delayed,planned_end.lt.${today}`)
          .order('planned_end', { ascending: true, nullsFirst: false })
          .limit(ACTIVITY_LIMIT)
      : Promise.resolve({ data: [], count: 0 }),
    features.daily_logs
      ? supabase
          .from('daily_logs')
          .select('id, project_id, log_date, delay_reason, delay_description, projects(name)', { count: 'exact' })
          .eq('organization_id', orgId)
          .not('delay_description', 'is', null)
          .gte('log_date', daysBefore(today, LOG_DELAY_WINDOW_DAYS))
          .order('log_date', { ascending: false })
          .limit(LOG_DELAY_LIMIT)
      : Promise.resolve({ data: [], count: 0 }),
  ])

  const activityIds = (activitiesRes.data ?? []).map((a) => a.id)
  const companiesByActivity = new Map<string, string[]>()
  if (features.subcontractors && activityIds.length > 0) {
    const { data } = await supabase
      .from('schedule_activity_assignments')
      .select('schedule_activity_id, subcontractor_companies(company_name)')
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .in('schedule_activity_id', activityIds)
    for (const row of data ?? []) {
      const co = row.subcontractor_companies as { company_name: string } | { company_name: string }[] | null
      const name = (Array.isArray(co) ? co[0]?.company_name : co?.company_name) ?? null
      if (!name) continue
      companiesByActivity.set(row.schedule_activity_id, [...(companiesByActivity.get(row.schedule_activity_id) ?? []), name])
    }
  }

  const notifications: AttentionNotification[] = (notificationsRes.data ?? []).map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    link: n.link,
    kind: n.kind,
    action_required: n.action_required,
    dedupe_key: n.dedupe_key,
    created_at: n.created_at,
    project_id: n.project_id,
    projectName: projectName(n.projects as ProjectRef),
  }))
  const activities: AttentionActivity[] = (activitiesRes.data ?? []).map((a) => ({
    id: a.id,
    project_id: a.project_id,
    name: a.name,
    status: a.status,
    planned_end: a.planned_end,
    projectName: projectName(a.projects as ProjectRef),
    companies: companiesByActivity.get(a.id),
  }))
  const logDelays: AttentionDailyLogDelay[] = (logDelaysRes.data ?? []).map((l) => ({
    id: l.id,
    project_id: l.project_id,
    projectName: projectName(l.projects as ProjectRef),
    log_date: l.log_date,
    delay_reason: l.delay_reason,
    delay_description: l.delay_description as string,
  }))

  const items = buildAttentionItems(notifications, activities, features, today, logDelays)
  const pendingNotifications = items.filter((i) => i.priority === 'pending').length
  const activityTotal = features.schedule ? (activitiesRes.count ?? activities.length) : 0
  const logDelayTotal = features.daily_logs ? (logDelaysRes.count ?? logDelays.length) : 0

  return {
    items,
    total: pendingNotifications + activityTotal + logDelayTotal,
    totalIsLowerBound: notifications.length === NOTIFICATION_LIMIT,
    updates: informationalNotifications(notifications, features).slice(0, 5),
  }
}
