import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { isOverdue, todayIso, type ActivityStatus } from '@/lib/schedule'
import type { FeatureMap } from '@/lib/feature-registry'
import type { ProjectStatus } from '@/lib/domain'
import { BUILDER_OWNED_STATUSES, OPEN_CLAIM_STATUSES, type ClaimStatus } from '@/lib/warranty-coverage'
import { ESTIMATE_STAGES } from '@/lib/project-next-action'
import {
  stagePhaseMatcher,
  summarizeStageActivities,
  type StageActivities,
  type StageActivityRow,
} from '@/lib/stage-activities'

export type NextActivity = { id: string; name: string; dueOn: string | null; overdue: boolean }
export type OverdueActivity = { id: string; name: string; dueOn: string | null }
export type WarrantySummary = {
  stage: string
  milestoneLabel: string | null
  milestoneDueOn: string | null
  startDate: string | null
}
export type OpenClaimSummary = { id: string; title: string; status: string; builderOwned: boolean }
export type EstimateSummary = {
  id: string
  number: string | null
  name: string
  status: 'draft' | 'internal_review' | 'submitted'
  expirationDate: string | null
  expired: boolean
}

export type DashboardCardDetails = {
  scheduleEnabled: boolean
  /** True only when the project has real schedule activities, so progress_percent is meaningful. */
  hasSchedule: boolean
  /** Activities exist but none has a planned date or has moved past "not started". */
  scheduleNotStarted: boolean
  activityCount: number
  nextActivity: NextActivity | null
  /** Earliest open activity whose planned finish has passed. */
  overdueActivity: OverdueActivity | null
  behindSchedule: boolean
  holdReason: string | null
  warranty: WarrantySummary | null
  /** Oldest open claim, preferring ones where the builder owns the next step. */
  openClaim: OpenClaimSummary | null
  openClaimCount: number
  /** Current (not superseded) estimate still in progress or awaiting a decision. */
  estimate: EstimateSummary | null
  /** A query this project's next action depends on failed, so "nothing pending" cannot be claimed. */
  loadError: boolean
  /** Activities in the job's current stage; null when scheduling is off or the stage has no working schedule. */
  stageActivities: StageActivities | null
}

type ActivityRow = StageActivityRow & { status: ActivityStatus }
type DependencyRow = { project_id: string; predecessor_id: string; successor_id: string }
type ClaimRow = { id: string; project_id: string; title: string; status: ClaimStatus; reported_at: string }
type EstimateRow = {
  id: string
  project_id: string
  estimate_number: string | null
  name: string
  status: string
  expiration_date: string | null
  revised_from_id: string | null
  updated_at: string
}

const EMPTY: DashboardCardDetails = {
  scheduleEnabled: false,
  hasSchedule: false,
  scheduleNotStarted: false,
  activityCount: 0,
  nextActivity: null,
  overdueActivity: null,
  behindSchedule: false,
  holdReason: null,
  warranty: null,
  openClaim: null,
  openClaimCount: 0,
  estimate: null,
  loadError: false,
  stageActivities: null,
}

const OPEN_ESTIMATE_PRIORITY: Record<string, number> = { draft: 0, internal_review: 0, submitted: 1 }

/** Projects per schedule request, so `ids × 120` rows stays under the API's default 1,000-row response cap. */
const STAGE_CHUNK = 8

/**
 * The current-stage next step (same `summarizeStageActivities` selection the cards use) for every given project, fetched
 * in small batches so no project's activities are silently truncated. `today` is the workspace's calendar date.
 */
export async function getStageNextSteps(
  organizationId: string,
  projects: { id: string; status: ProjectStatus }[],
  scheduleEnabled: boolean,
  today: string,
): Promise<Map<string, StageActivities | null>> {
  const result = new Map<string, StageActivities | null>(projects.map((p) => [p.id, null]))
  const scheduled = projects.filter((p) => stagePhaseMatcher(p.status))
  if (!scheduleEnabled || !scheduled.length) return result
  const supabase = await createClient()
  const chunks: (typeof scheduled)[] = []
  for (let i = 0; i < scheduled.length; i += STAGE_CHUNK) chunks.push(scheduled.slice(i, i + STAGE_CHUNK))
  await Promise.all(
    chunks.map(async (chunk) => {
      const ids = chunk.map((p) => p.id)
      const [activitiesRes, depsRes] = await Promise.all([
        supabase
          .from('schedule_activities')
          .select('id, project_id, name, phase, activity_type, status, planned_end, sort_order')
          .eq('organization_id', organizationId)
          .in('project_id', ids)
          .limit(ids.length * 120),
        supabase
          .from('schedule_dependencies')
          .select('project_id, predecessor_id, successor_id')
          .eq('organization_id', organizationId)
          .in('project_id', ids),
      ])
      const failed = !!activitiesRes.error || !!depsRes.error
      const activities = (activitiesRes.data ?? []) as ActivityRow[]
      const deps = (depsRes.data ?? []) as DependencyRow[]
      for (const p of chunk) {
        result.set(
          p.id,
          failed
            ? { state: 'unavailable' }
            : summarizeStageActivities(
                p.status,
                activities.filter((a) => a.project_id === p.id),
                deps.filter((d) => d.project_id === p.id),
                today,
              ),
        )
      }
    }),
  )
  return result
}

/** Real per-project details for project cards and rows, fetched in batches for only the projects being shown. */
export async function getDashboardCardDetails(
  organizationId: string,
  projects: { id: string; status: ProjectStatus }[],
  features: FeatureMap,
  /** Workspace calendar date (YYYY-MM-DD); defaults to the server's local date for existing callers. */
  todayOverride?: string,
): Promise<Map<string, DashboardCardDetails>> {
  const ids = projects.map((p) => p.id)
  const result = new Map<string, DashboardCardDetails>(
    ids.map((id) => [id, { ...EMPTY, scheduleEnabled: Boolean(features.schedule) }]),
  )
  if (!ids.length) return result

  const onHoldIds = projects.filter((p) => p.status === 'on_hold').map((p) => p.id)
  const completedIds = projects.filter((p) => p.status === 'completed').map((p) => p.id)
  const estimateIds = projects.filter((p) => ESTIMATE_STAGES.includes(p.status)).map((p) => p.id)
  const supabase = await createClient()

  const [activitiesRes, depsRes, holdRes, warrantyRes, claimsRes, estimatesRes] = await Promise.all([
    features.schedule
      ? supabase
          .from('schedule_activities')
          .select('id, project_id, name, phase, activity_type, status, planned_end, sort_order')
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
      : Promise.resolve({ data: [] as { project_id: string; note: string | null }[], error: null }),
    features.warranty && completedIds.length
      ? supabase
          .from('project_warranties')
          .select(
            'project_id, stage, start_date, current:warranty_milestones!project_warranties_current_milestone_fk(stage_label, due_on)',
          )
          .in('project_id', completedIds)
          .is('archived_at', null)
      : Promise.resolve({ data: [] as unknown[], error: null }),
    features.warranty && completedIds.length
      ? supabase
          .from('warranty_claims')
          .select('id, project_id, title, status, reported_at')
          .eq('organization_id', organizationId)
          .in('project_id', completedIds)
          .in('status', OPEN_CLAIM_STATUSES)
          .order('reported_at', { ascending: true })
          .limit(completedIds.length * 50)
      : Promise.resolve({ data: [] as ClaimRow[], error: null }),
    features.estimates && estimateIds.length
      ? supabase
          .from('estimates')
          .select('id, project_id, estimate_number, name, status, expiration_date, revised_from_id, updated_at')
          .eq('organization_id', organizationId)
          .in('project_id', estimateIds)
          .order('updated_at', { ascending: false })
          .limit(estimateIds.length * 40)
      : Promise.resolve({ data: [] as EstimateRow[], error: null }),
  ])

  const today = todayOverride ?? todayIso()
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
      if (failed && p.status !== 'completed') details.loadError = true
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
    const overdue = open.find((a) => isOverdue(a, today))
    details.behindSchedule = Boolean(overdue)
    if (overdue) details.overdueActivity = { id: overdue.id, name: overdue.name, dueOn: overdue.planned_end }
    const next = open[0]
    if (next) details.nextActivity = { id: next.id, name: next.name, dueOn: next.planned_end, overdue: isOverdue(next, today) }
  }

  for (const row of (holdRes.data ?? []) as { project_id: string; note: string | null }[]) {
    const details = result.get(row.project_id)
    if (details && details.holdReason === null && row.note?.trim()) details.holdReason = row.note.trim()
  }

  if (warrantyRes.error || claimsRes.error) {
    for (const id of completedIds) {
      const details = result.get(id)
      if (details) details.loadError = true
    }
  }

  type WarrantyRow = {
    project_id: string
    stage: string
    start_date: string | null
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
      startDate: w.start_date ?? null,
    }
  }

  for (const c of (claimsRes.data ?? []) as ClaimRow[]) {
    const details = result.get(c.project_id)
    if (!details) continue
    details.openClaimCount += 1
    const builderOwned = BUILDER_OWNED_STATUSES.includes(c.status)
    if (!details.openClaim || (builderOwned && !details.openClaim.builderOwned)) {
      details.openClaim = { id: c.id, title: c.title, status: c.status, builderOwned }
    }
  }

  if (estimatesRes.error) {
    for (const id of estimateIds) {
      const details = result.get(id)
      if (details) details.loadError = true
    }
  }
  const estimateRows = (estimatesRes.data ?? []) as EstimateRow[]
  const superseded = new Set(estimateRows.map((e) => e.revised_from_id).filter(Boolean))
  for (const e of estimateRows) {
    if (superseded.has(e.id) || !(e.status in OPEN_ESTIMATE_PRIORITY)) continue
    const details = result.get(e.project_id)
    if (!details) continue
    const current = details.estimate
    if (current && OPEN_ESTIMATE_PRIORITY[current.status] <= OPEN_ESTIMATE_PRIORITY[e.status]) continue
    details.estimate = {
      id: e.id,
      number: e.estimate_number,
      name: e.name,
      status: e.status as EstimateSummary['status'],
      expirationDate: e.expiration_date,
      expired: e.status === 'submitted' && !!e.expiration_date && e.expiration_date < today,
    }
  }

  return result
}
