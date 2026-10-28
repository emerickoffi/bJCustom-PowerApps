import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { todayIso } from '@/lib/schedule'
import {
  buildAttentionItems,
  informationalNotifications,
  type AttentionActivity,
  type AttentionItem,
  type AttentionNotification,
} from '@/lib/attention'

type ProjectRef = { name: string } | { name: string }[] | null
const projectName = (p: ProjectRef) => (Array.isArray(p) ? p[0]?.name : p?.name) ?? null

const NOTIFICATION_LIMIT = 60
const ACTIVITY_LIMIT = 20

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
  features: { schedule: boolean; warranty: boolean; documents: boolean; e_signatures: boolean },
): Promise<DashboardAttention> {
  const supabase = await createClient()
  const today = todayIso()
  const [notificationsRes, activitiesRes] = await Promise.all([
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
  ])

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
  }))

  const items = buildAttentionItems(notifications, activities, features, today)
  const pendingNotifications = items.filter((i) => i.priority === 'pending').length
  const activityTotal = features.schedule ? (activitiesRes.count ?? activities.length) : 0

  return {
    items,
    total: pendingNotifications + activityTotal,
    totalIsLowerBound: notifications.length === NOTIFICATION_LIMIT,
    updates: informationalNotifications(notifications, features).slice(0, 5),
  }
}
