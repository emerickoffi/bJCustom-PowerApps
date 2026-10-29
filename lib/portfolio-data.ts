import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { todayIso } from '@/lib/schedule'
import type { PortfolioSignals } from '@/lib/portfolio'

/** Bounded so a very large org can't pull unbounded rows; ranking degrades to the lifecycle fallback past it. */
const SIGNAL_ROW_LIMIT = 1000

/**
 * Real attention and upcoming-milestone signals, read through RLS so they only cover projects
 * the signed-in user can already see. Returns project ids only — no activity details reach the browser.
 */
export async function loadPortfolioSignals(
  orgId: string,
  userId: string,
  scheduleEnabled: boolean,
): Promise<PortfolioSignals> {
  const supabase = await createClient()
  const today = todayIso()
  const empty = Promise.resolve({ data: [] as { project_id: string | null; planned_end?: string | null }[] })

  const [overdueRes, upcomingRes, notificationsRes] = await Promise.all([
    scheduleEnabled
      ? supabase
          .from('schedule_activities')
          .select('project_id')
          .eq('organization_id', orgId)
          .not('status', 'in', '(completed,skipped)')
          .or(`status.eq.delayed,planned_end.lt.${today}`)
          .limit(SIGNAL_ROW_LIMIT)
      : empty,
    scheduleEnabled
      ? supabase
          .from('schedule_activities')
          .select('project_id, planned_end')
          .eq('organization_id', orgId)
          .not('status', 'in', '(completed,skipped)')
          .gte('planned_end', today)
          .order('planned_end', { ascending: true })
          .limit(SIGNAL_ROW_LIMIT)
      : empty,
    supabase
      .from('notifications')
      .select('project_id')
      .eq('user_id', userId)
      .eq('organization_id', orgId)
      .eq('action_required', true)
      .is('read_at', null)
      .not('project_id', 'is', null)
      .limit(SIGNAL_ROW_LIMIT),
  ])

  const attention = new Set<string>()
  for (const row of [...(overdueRes.data ?? []), ...(notificationsRes.data ?? [])]) {
    if (row.project_id) attention.add(row.project_id)
  }
  const upcoming = new Map<string, string>()
  for (const row of (upcomingRes.data ?? []) as { project_id: string; planned_end: string | null }[]) {
    if (row.planned_end && !upcoming.has(row.project_id)) upcoming.set(row.project_id, row.planned_end)
  }
  return { attention, upcoming }
}
