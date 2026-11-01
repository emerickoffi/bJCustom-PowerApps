import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { isOverdue, todayIso, type ActivityStatus } from '@/lib/schedule'
import type { FeatureMap } from '@/lib/feature-registry'
import type { ProjectStatus } from '@/lib/domain'
import {
  stagePhaseMatcher,
  summarizeStageActivities,
  type StageActivities,
  type StageActivityRow,
} from '@/lib/stage-activities'

export type NextActivity = { name: string; dueOn: string | null; overdue: boolean }
export type WarrantySummary = { stage: string; milestoneLabel: string | null; milestoneDueOn: string | null }

export type DashboardCardDetails = {
  /** True only when the project has real schedule activities, so progress_percent is meaningful. */
  hasSchedule: boolean
  /** Activities exist but none has a planned date or has moved past "not started". */
  scheduleNotStarted: boolean
  activityCount: number
  nextActivity: NextActivity | null
  behindSchedule: boolean
  holdReason: string | null
  warranty: WarrantySummary | null
  /** Activities in the job's current stage; null when scheduling is off or the stage has no working schedule. */
  stageActivities: StageActivities | null
}

type ActivityRow = StageActivityRow & { status: ActivityStatus }
type DependencyRow = { project_id: string; predecessor_id: string; successor_id: string }

const EMPTY: DashboardCardDetails = {
  hasSchedule: false,
  scheduleNotStarted: false,
  activityCount: 0,
  nextActivity: null,
  behindSchedule: false,
  holdReason: null,
  warranty: null,
  stageActivities: null,
}

/** Real per-project details for the dashboard cards, limited to the projects being shown. */
export async function getDashboardCardDetails(
  organizationId: string,
  projects: { id: string; status: ProjectStatus }[],
  features: FeatureMap,
): Promise<Map<string, DashboardCardDetails>> {
  const ids = projects.map((p) => p.id)
  const result = new Map<string, DashboardCardDetails>(ids.map((id) => [id, { ...EMPTY }]))
  if (!ids.length) return result

  const onHoldIds = projects.filter((p) => p.status === 'on_hold').map((p) => p.id)
  const completedIds = projects.filter((p) => p.status === 'completed').map((p) => p.id)
  const supabase = await createClient()

  const [activitiesRes, depsRes, holdRes, warrantyRes] = await Promise.all([
    features.schedule
      ? supabase
          .from('schedule_activities')
          .select('id, project_id, name, phase, status, planned_end, sort_order')
          .eq('organization_id', organizationId)
          .in('project_id', ids)
          .limit(ids.length * 120)
      : Promise.resolve({ data: [] as ActivityRow[], error: null }),
    features.schedule
      ? supabase
          .from('schedule_dependencies')
          .select('project_id, predecessor_id, successor_id')
          .eq('organization_id', organizationId)
          .in('project_id', ids)
      : Promise.resolve({ data: [] as DependencyRow[], error: null }),
    onHoldIds.length
      ? supabase
          .from('project_status_history')
          .select('project_id, note, created_at')
          .eq('organization_id', organizationId)
          .eq('to_status', 'on_hold')
          .in('project_id', onHoldIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as { project_id: string; note: string | null }[] }),
    features.warranty && completedIds.length
      ? supabase
          .from('project_warranties')
          .select(
            'project_id, stage, current:warranty_milestones!project_warranties_current_milestone_fk(stage_label, due_on)',
          )
          .in('project_id', completedIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ])

  const today = todayIso()
  const byProject = new Map<string, ActivityRow[]>()
  for (const a of (activitiesRes.data ?? []) as ActivityRow[]) {
    const list = byProject.get(a.project_id) ?? []
    list.push(a)
    byProject.set(a.project_id, list)
  }
  const depsByProject = new Map<string, DependencyRow[]>()
  for (const d of (depsRes.data ?? []) as DependencyRow[]) {
    const list = depsByProject.get(d.project_id) ?? []
    list.push(d)
    depsByProject.set(d.project_id, list)
  }
  if (features.schedule) {
    const failed = !!activitiesRes.error || !!depsRes.error
    for (const p of projects) {
      const details = result.get(p.id)
      if (!details) continue
      details.stageActivities = failed
        ? stagePhaseMatcher(p.status)
          ? { state: 'unavailable' }
          : null
        : summarizeStageActivities(p.status, byProject.get(p.id) ?? [], depsByProject.get(p.id) ?? [], today)
    }
  }
  for (const [projectId, list] of byProject) {
    const details = result.get(projectId)
    if (!details) continue
    details.hasSchedule = true
    details.activityCount = list.length
    details.scheduleNotStarted = list.every((a) => !a.planned_end && a.status === 'not_started')
    const open = list
      .filter((a) => a.status !== 'completed' && a.status !== 'skipped')
      .sort((a, b) => {
        if (a.planned_end && b.planned_end && a.planned_end !== b.planned_end) return a.planned_end < b.planned_end ? -1 : 1
        if (a.planned_end && !b.planned_end) return -1
        if (!a.planned_end && b.planned_end) return 1
        return a.sort_order - b.sort_order
      })
    details.behindSchedule = open.some((a) => isOverdue(a, today))
    const next = open[0]
    if (next) details.nextActivity = { name: next.name, dueOn: next.planned_end, overdue: isOverdue(next, today) }
  }

  for (const row of (holdRes.data ?? []) as { project_id: string; note: string | null }[]) {
    const details = result.get(row.project_id)
    if (details && details.holdReason === null && row.note?.trim()) details.holdReason = row.note.trim()
  }

  type WarrantyRow = {
    project_id: string
    stage: string
    current: { stage_label: string; due_on: string } | { stage_label: string; due_on: string }[] | null
  }
  for (const w of (warrantyRes.data ?? []) as WarrantyRow[]) {
    const details = result.get(w.project_id)
    if (!details) continue
    const current = Array.isArray(w.current) ? w.current[0] : w.current
    details.warranty = {
      stage: w.stage,
      milestoneLabel: current?.stage_label ?? null,
      milestoneDueOn: current?.due_on ?? null,
    }
  }

  return result
}
