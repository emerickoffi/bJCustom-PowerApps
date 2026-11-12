export type TimelineActivityInput = {
  id: string
  name: string
  phase_id: string | null
  phase: string | null
  status: string
  activity_type: string
  planned_start: string | null
  planned_end: string | null
  sort_order: number
}

export type TimelinePhaseInput = { id: string; name: string; sort_order: number }

export type PhaseState = 'complete' | 'in_progress' | 'delayed' | 'upcoming' | 'needs_dates'

export type TimelinePhase = {
  key: string
  name: string
  total: number
  completed: number
  state: PhaseState
  start: string | null
  end: string | null
  isCurrent: boolean
}

export type TimelineMilestone = {
  id: string
  name: string
  date: string | null
  status: string
  overdue: boolean
}

export type ScheduleHealth = 'complete' | 'on_track' | 'at_risk' | 'behind' | 'not_scheduled' | 'empty'

export type JobTimeline = {
  phases: TimelinePhase[]
  milestones: TimelineMilestone[]
  health: ScheduleHealth
  overdueCount: number
  undatedCount: number
  /** Planned finish of the last dated activity. */
  forecastEnd: string | null
  next: { id: string; name: string; date: string | null; isMilestone: boolean } | null
}

const DONE = new Set(['completed', 'skipped'])

function overdue(a: TimelineActivityInput, today: string) {
  return !!a.planned_end && a.planned_end < today && !DONE.has(a.status)
}

function minIso(a: string | null, b: string | null) {
  if (!a) return b
  if (!b) return a
  return a < b ? a : b
}
function maxIso(a: string | null, b: string | null) {
  if (!a) return b
  if (!b) return a
  return a > b ? a : b
}

/**
 * Derives a phase-level view of a project schedule. Nothing here is stored: the timeline always
 * reflects the activities as they are, so it cannot drift from the detailed schedule.
 */
export function buildJobTimeline(
  phases: TimelinePhaseInput[],
  activities: TimelineActivityInput[],
  today: string,
  targetCompletion: string | null = null,
): JobTimeline {
  const ordered = [...phases].sort((a, b) => a.sort_order - b.sort_order)
  const idByName = new Map(ordered.map((p) => [p.name.trim().toLowerCase(), p.id]))
  const groups = new Map<string, TimelineActivityInput[]>()
  const loose: TimelineActivityInput[] = []
  const counted = [...activities].filter((a) => a.status !== 'skipped').sort((a, b) => a.sort_order - b.sort_order)
  for (const a of counted) {
    const id = a.phase_id ?? (a.phase ? idByName.get(a.phase.trim().toLowerCase()) : undefined)
    if (id && ordered.some((p) => p.id === id)) {
      const list = groups.get(id) ?? []
      list.push(a)
      groups.set(id, list)
    } else loose.push(a)
  }

  const rows: { key: string; name: string; acts: TimelineActivityInput[] }[] = ordered
    .map((p) => ({ key: p.id, name: p.name, acts: groups.get(p.id) ?? [] }))
    .filter((r) => r.acts.length > 0)
  if (loose.length) rows.push({ key: 'unphased', name: 'Other work', acts: loose })

  const timelinePhases: TimelinePhase[] = rows.map((r) => {
    const completed = r.acts.filter((a) => DONE.has(a.status)).length
    let start: string | null = null
    let end: string | null = null
    for (const a of r.acts) {
      start = minIso(start, a.planned_start ?? a.planned_end)
      end = maxIso(end, a.planned_end ?? a.planned_start)
    }
    let state: PhaseState
    if (completed === r.acts.length) state = 'complete'
    else if (r.acts.some((a) => a.status === 'delayed' || overdue(a, today))) state = 'delayed'
    else if (r.acts.some((a) => a.status === 'in_progress') || completed > 0) state = 'in_progress'
    else if (!start) state = 'needs_dates'
    else state = 'upcoming'
    return { key: r.key, name: r.name, total: r.acts.length, completed, state, start, end, isCurrent: false }
  })
  const current = timelinePhases.findIndex((p) => p.state !== 'complete')
  if (current >= 0) timelinePhases[current].isCurrent = true

  const milestones: TimelineMilestone[] = counted
    .filter((a) => a.activity_type === 'milestone')
    .map((a) => ({
      id: a.id,
      name: a.name,
      date: a.planned_end ?? a.planned_start,
      status: a.status,
      overdue: overdue(a, today),
    }))

  const open = counted.filter((a) => !DONE.has(a.status))
  const overdueCount = open.filter((a) => a.status === 'delayed' || overdue(a, today)).length
  const undatedCount = open.filter((a) => !a.planned_start && !a.planned_end).length
  let forecastEnd: string | null = null
  for (const a of counted) forecastEnd = maxIso(forecastEnd, a.planned_end ?? a.planned_start)

  const dated = open
    .filter((a) => a.planned_start || a.planned_end)
    .sort((a, b) => (a.planned_start ?? a.planned_end ?? '').localeCompare(b.planned_start ?? b.planned_end ?? ''))
  const nextAct = dated[0]

  let health: ScheduleHealth
  if (counted.length === 0) health = 'empty'
  else if (open.length === 0) health = 'complete'
  else if (dated.length === 0) health = 'not_scheduled'
  else if (overdueCount > 0) health = 'behind'
  else if (targetCompletion && forecastEnd && forecastEnd > targetCompletion) health = 'at_risk'
  else health = 'on_track'

  return {
    phases: timelinePhases,
    milestones,
    health,
    overdueCount,
    undatedCount,
    forecastEnd,
    next: nextAct
      ? {
          id: nextAct.id,
          name: nextAct.name,
          date: nextAct.planned_start ?? nextAct.planned_end,
          isMilestone: nextAct.activity_type === 'milestone',
        }
      : null,
  }
}

export const HEALTH_LABELS: Record<ScheduleHealth, string> = {
  complete: 'Complete',
  on_track: 'On track',
  at_risk: 'At risk',
  behind: 'Behind',
  not_scheduled: 'Needs dates',
  empty: 'No schedule',
}

export const PHASE_STATE_LABELS: Record<PhaseState, string> = {
  complete: 'Complete',
  in_progress: 'In progress',
  delayed: 'Delayed',
  upcoming: 'Upcoming',
  needs_dates: 'Needs dates',
}
