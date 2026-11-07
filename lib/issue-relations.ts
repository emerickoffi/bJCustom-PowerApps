import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChangeOrderStatus } from '@/lib/change-orders'
import type { ActivityStatus } from '@/lib/schedule'
import type { IssueEvent } from '@/lib/walkthroughs'

export type RelatedChangeOrder = {
  id: string
  co_number: string
  title: string
  status: ChangeOrderStatus
  price_pending: boolean
  price_adjustment_cents: number
  created_from_issue: boolean
}

export type RelatedActivity = {
  id: string
  name: string
  status: ActivityStatus
  planned_start: string | null
  planned_end: string | null
}

export type ReviewThread = {
  requestId: string
  requestedBy: string | null
  reviewerId: string | null
  question: string
  requestedAt: string
  response: { body: string; by: string | null; at: string } | null
}

export type IssueRelations = {
  changeOrders: RelatedChangeOrder[] | null
  changeOrderOptions: { value: string; label: string }[]
  activities: RelatedActivity[] | null
  activityOptions: { value: string; label: string }[]
  reviews: ReviewThread[]
  recordLabels: Record<string, string>
}

type CoRow = Omit<RelatedChangeOrder, 'created_from_issue'>

export async function getIssueRelations(
  supabase: SupabaseClient,
  opts: { projectId: string; issueId: string; showChangeOrders: boolean; showSchedule: boolean; events: IssueEvent[] },
): Promise<IssueRelations> {
  const { projectId, issueId, showChangeOrders, showSchedule, events } = opts
  const coCols = 'id, co_number, title, status, price_pending, price_adjustment_cents'

  const [coLinksRes, coAllRes, actLinksRes, actAllRes] = await Promise.all([
    showChangeOrders
      ? supabase.from('project_issue_change_orders').select('change_order_id, created_from_issue').eq('issue_id', issueId)
      : Promise.resolve({ data: null, error: null }),
    showChangeOrders
      ? supabase.from('change_orders').select(coCols).eq('project_id', projectId).order('number', { ascending: false }).limit(300)
      : Promise.resolve({ data: null, error: null }),
    showSchedule
      ? supabase.from('project_issue_schedule_activities').select('activity_id').eq('issue_id', issueId)
      : Promise.resolve({ data: null, error: null }),
    showSchedule
      ? supabase
          .from('schedule_activities')
          .select('id, name, status, planned_start, planned_end')
          .eq('project_id', projectId)
          .order('planned_start', { ascending: true, nullsFirst: false })
          .limit(500)
      : Promise.resolve({ data: null, error: null }),
  ])

  const recordLabels: Record<string, string> = {}

  let changeOrders: RelatedChangeOrder[] | null = null
  let changeOrderOptions: { value: string; label: string }[] = []
  if (showChangeOrders && !coLinksRes.error && !coAllRes.error) {
    const all = (coAllRes.data ?? []) as CoRow[]
    for (const co of all) recordLabels[co.id] = `${co.co_number} · ${co.title}`
    const links = new Map(((coLinksRes.data ?? []) as { change_order_id: string; created_from_issue: boolean }[]).map((l) => [l.change_order_id, l.created_from_issue]))
    changeOrders = all.filter((co) => links.has(co.id)).map((co) => ({ ...co, created_from_issue: links.get(co.id) ?? false }))
    changeOrderOptions = all
      .filter((co) => !links.has(co.id) && co.status !== 'void')
      .map((co) => ({ value: co.id, label: `${co.co_number} · ${co.title}` }))
  }

  let activities: RelatedActivity[] | null = null
  let activityOptions: { value: string; label: string }[] = []
  if (showSchedule && !actLinksRes.error && !actAllRes.error) {
    const all = (actAllRes.data ?? []) as RelatedActivity[]
    for (const a of all) recordLabels[a.id] = a.name
    const linked = new Set(((actLinksRes.data ?? []) as { activity_id: string }[]).map((l) => l.activity_id))
    activities = all.filter((a) => linked.has(a.id))
    activityOptions = all.filter((a) => !linked.has(a.id)).map((a) => ({ value: a.id, label: a.name }))
  }

  const responses = new Map(
    events.filter((e) => e.event_type === 'review_responded' && e.from_value).map((e) => [e.from_value as string, e]),
  )
  const reviews: ReviewThread[] = events
    .filter((e) => e.event_type === 'review_requested')
    .map((e) => {
      const r = responses.get(e.id)
      return {
        requestId: e.id,
        requestedBy: e.actor_id,
        reviewerId: e.to_value,
        question: e.details ?? '',
        requestedAt: e.created_at,
        response: r ? { body: r.details ?? '', by: r.actor_id, at: r.created_at } : null,
      }
    })

  return { changeOrders, changeOrderOptions, activities, activityOptions, reviews, recordLabels }
}
