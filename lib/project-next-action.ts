import { formatDate } from './format.ts'
import { SCHEDULE_DATES_NEEDED } from './schedule.ts'
import type { ProjectStatus } from './domain.ts'
import type { DashboardCardDetails } from './dashboard-cards.ts'

/**
 * `action` is something a builder can do now; `info` is a state worth knowing (coverage,
 * waiting on a client); `unavailable` means the records could not be loaded, which is
 * different from having nothing pending.
 */
export type NextActionKind = 'action' | 'info' | 'unavailable'
export type NextActionIcon =
  | 'hold'
  | 'overdue'
  | 'next'
  | 'blocked'
  | 'schedule'
  | 'estimate'
  | 'claim'
  | 'warranty'
  | 'completed'
  | 'none'
  | 'error'
export type NextActionTone = 'neutral' | 'danger' | 'success' | 'muted'

export type NextAction = {
  kind: NextActionKind
  icon: NextActionIcon
  title: string
  meta: string | null
  href?: string
  tone: NextActionTone
}

/** Stages where an estimate is still the active piece of work. Construction stages are driven by the schedule. */
export const ESTIMATE_STAGES: readonly ProjectStatus[] = ['lead', 'consultation', 'planning', 'estimating', 'awaiting_approval']

const CLAIM_STATUS_TEXT: Record<string, string> = {
  submitted: 'New claim',
  under_review: 'Under review',
  info_requested: 'Waiting on homeowner info',
  accepted: 'Accepted, repair to plan',
  not_covered: 'Not covered, awaiting homeowner',
  in_progress: 'Repair in progress',
  ready_for_validation: 'Awaiting homeowner confirmation',
}

const WARRANTY_STAGE_TEXT: Record<string, string> = {
  completed: 'Warranty period complete',
  ready_to_archive: 'Warranty ready to archive',
  archived: 'Warranty archived',
}

const NO_PENDING: NextAction = { kind: 'info', icon: 'none', title: 'No pending action', meta: null, tone: 'muted' }

export type NextActionProject = {
  id: string
  status: ProjectStatus
  warrantyEnabled: boolean
  /** Planning dates is manager work. Omitted on surfaces that do not vary the action by viewer, where it stays shown. */
  canPlanSchedule?: boolean
}

/** A planning step, never a delay: open work exists and none of it is dated. Same rule as the preview's Upcoming work. */
function scheduleDatesAction(p: NextActionProject, d: DashboardCardDetails): NextAction | null {
  if (!d.scheduleEnabled || d.undatedOpenCount === 0 || p.canPlanSchedule === false) return null
  return {
    kind: 'action',
    icon: 'schedule',
    title: SCHEDULE_DATES_NEEDED,
    meta: `${d.undatedOpenCount} open ${d.undatedOpenCount === 1 ? 'activity' : 'activities'} · no planned dates yet`,
    href: `/projects/${p.id}/schedule`,
    tone: 'neutral',
  }
}

export function buildNextAction(p: NextActionProject, d: DashboardCardDetails): NextAction {
  const base = `/projects/${p.id}`
  const activityHref = (id: string) => `${base}/schedule?activity=${encodeURIComponent(id)}`

  if (p.status === 'on_hold') {
    return { kind: 'info', icon: 'hold', title: 'On hold', meta: d.holdReason ?? 'No hold reason recorded', tone: 'danger' }
  }
  if (p.status === 'cancelled') return { kind: 'info', icon: 'none', title: 'Project cancelled', meta: null, tone: 'muted' }
  if (d.loadError) {
    return {
      kind: 'unavailable',
      icon: 'error',
      title: 'Next action unavailable',
      meta: 'Project records could not be loaded. Refresh to try again.',
      tone: 'muted',
    }
  }

  if (p.status === 'completed') {
    const claim = d.openClaim
    if (claim) {
      const more = d.openClaimCount > 1 ? ` · ${d.openClaimCount - 1} more open` : ''
      const href = `${base}/warranty#claim-${claim.id}`
      const meta = `${CLAIM_STATUS_TEXT[claim.status] ?? 'Open claim'}${more}`
      return claim.builderOwned
        ? { kind: 'action', icon: 'claim', title: `Review warranty claim: ${claim.title}`, meta, href, tone: 'neutral' }
        : { kind: 'info', icon: 'claim', title: `Warranty claim: ${claim.title}`, meta, href, tone: 'muted' }
    }
    const w = d.warranty
    if (w) {
      if (w.stage === 'monitoring') {
        const meta = [w.milestoneLabel, w.startDate ? `Started ${formatDate(w.startDate)}` : null].filter(Boolean).join(' · ')
        return { kind: 'info', icon: 'warranty', title: 'Warranty coverage active', meta: meta || null, href: `${base}/warranty`, tone: 'muted' }
      }
      return {
        kind: 'info',
        icon: 'warranty',
        title: WARRANTY_STAGE_TEXT[w.stage] ?? 'Warranty on file',
        meta: null,
        href: `${base}/warranty`,
        tone: 'muted',
      }
    }
    if (p.warrantyEnabled) {
      return {
        kind: 'action',
        icon: 'warranty',
        title: 'Activate warranty',
        meta: 'Project completed · warranty not yet activated',
        href: `${base}/warranty`,
        tone: 'neutral',
      }
    }
    return { kind: 'info', icon: 'completed', title: 'Project completed', meta: null, tone: 'success' }
  }

  const overdue = d.overdueActivity
  if (overdue) {
    return {
      kind: 'action',
      icon: 'overdue',
      title: `Overdue: ${overdue.name}`,
      meta: overdue.dueOn ? `Planned to finish ${formatDate(overdue.dueOn)}` : null,
      href: activityHref(overdue.id),
      tone: 'danger',
    }
  }

  if (ESTIMATE_STAGES.includes(p.status)) {
    const e = d.estimate
    if (!e) return scheduleDatesAction(p, d) ?? NO_PENDING
    const label = e.number ? `estimate ${e.number}` : `estimate "${e.name}"`
    const href = `/estimates/${e.id}`
    if (e.status === 'draft') {
      return { kind: 'action', icon: 'estimate', title: `Finish ${label}`, meta: `Draft · ${e.name}`, href, tone: 'neutral' }
    }
    if (e.status === 'internal_review') {
      return { kind: 'action', icon: 'estimate', title: `Review ${label}`, meta: `Internal review · ${e.name}`, href, tone: 'neutral' }
    }
    if (e.expired && e.expirationDate) {
      return {
        kind: 'action',
        icon: 'estimate',
        title: `Follow up on ${label}`,
        meta: `Expired ${formatDate(e.expirationDate)} · no decision recorded`,
        href,
        tone: 'danger',
      }
    }
    return {
      kind: 'info',
      icon: 'estimate',
      title: `Client reviewing ${label}`,
      meta: e.expirationDate ? `Valid through ${formatDate(e.expirationDate)}` : 'Submitted · awaiting decision',
      href,
      tone: 'muted',
    }
  }

  if (!d.scheduleEnabled) return NO_PENDING
  if (!d.hasSchedule) {
    return {
      kind: 'action',
      icon: 'schedule',
      title: 'Set up schedule',
      meta: 'No schedule activities yet',
      href: `${base}/schedule`,
      tone: 'neutral',
    }
  }
  const planning = scheduleDatesAction(p, d)
  if (planning) return planning
  const stage = d.stageActivities
  if (stage?.state === 'blocked') {
    return {
      kind: 'info',
      icon: 'blocked',
      title: `Waiting: ${stage.activity.name}`,
      meta: 'Depends on earlier activities that are not finished',
      href: activityHref(stage.activity.id),
      tone: 'muted',
    }
  }
  const next = stage?.state === 'next' ? stage.activity : d.nextActivity
  if (next) {
    return {
      kind: 'action',
      icon: 'next',
      title: `Next: ${next.name}`,
      meta: next.dueOn ? `Due ${formatDate(next.dueOn)}` : 'No due date set',
      href: activityHref(next.id),
      tone: 'neutral',
    }
  }
  return { kind: 'info', icon: 'completed', title: 'All scheduled activities complete', meta: null, tone: 'muted' }
}
