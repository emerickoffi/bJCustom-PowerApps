import { addIsoDays, type AgendaActivity } from './agenda.ts'
import type { ProjectStatus } from './domain.ts'

/** Widest window loaded from the database; narrower ranges filter this set. */
export const COMING_UP_DAYS = 21
export const COMING_UP_VISIBLE = 5

export const COMING_UP_RANGES = ['today', '7', '21'] as const
export type ComingUpRange = (typeof COMING_UP_RANGES)[number]
export const DEFAULT_COMING_UP_RANGE: ComingUpRange = '7'
export const COMING_UP_RANGE_DAYS: Record<ComingUpRange, number> = { today: 1, '7': 7, '21': 21 }
export const COMING_UP_RANGE_LABELS: Record<ComingUpRange, string> = { today: 'Today', '7': 'Next 7 days', '21': 'Next 21 days' }

export function parseComingUpRange(value: unknown): ComingUpRange {
  return COMING_UP_RANGES.includes(value as ComingUpRange) ? (value as ComingUpRange) : DEFAULT_COMING_UP_RANGE
}

export type ComingUpEvent = {
  key: string
  date: string
  projectId: string
  projectName: string
  title: string
  description: string
  href: string
  kind: 'schedule' | 'proposed_start' | 'warranty'
  /** Proposed dates are not commitments and are labelled Tentative. */
  tentative: boolean
  assigneeName: string | null
  /** Explicit assignee only; never inferred from project manager or creator. */
  responsibleUserId: string | null
}

export type ProposedStartInput = { id: string; name: string; status: ProjectStatus; proposed_start_date: string | null }
export type WarrantyMilestoneInput = {
  projectId: string
  projectName: string
  coverageName: string | null
  milestoneLabel: string | null
  milestoneDueOn: string | null
}

/** Only projects that have not broken ground yet can have a meaningful proposed start. */
const PRE_START_STATUSES = new Set<ProjectStatus>([
  'lead',
  'consultation',
  'planning',
  'estimating',
  'awaiting_approval',
  'preconstruction',
])

const TYPE_LABEL: Record<string, string> = {
  task: 'Task',
  milestone: 'Milestone',
  inspection: 'Inspection',
  meeting: 'Meeting',
}

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))

/**
 * Merges real upcoming dates from three existing sources: open schedule activities that start in or overlap the
 * window (each activity listed once), proposed starts on pre-construction projects (Tentative, never committed), and
 * the next unreached warranty milestone. Dates are calendar dates in the org's zone; undated records are skipped.
 */
export function buildComingUp(input: {
  today: string
  days?: number
  activities: AgendaActivity[]
  proposedStarts: ProposedStartInput[]
  warranties: WarrantyMilestoneInput[]
  assigneeNames?: ReadonlyMap<string, string>
}): ComingUpEvent[] {
  const { today, days = COMING_UP_DAYS } = input
  const end = addIsoDays(today, days - 1)
  const inWindow = (d: string | null): d is string => !!d && d >= today && d <= end
  const events: ComingUpEvent[] = []
  const seen = new Set<string>()

  for (const a of input.activities) {
    if (a.status === 'completed' || a.status === 'skipped' || seen.has(a.id)) continue
    const start = a.planned_start ?? a.planned_end
    const finish = a.planned_end ?? a.planned_start
    if (!start || !finish || finish < today || start > end) continue
    seen.add(a.id)
    const type = TYPE_LABEL[a.activity_type] ?? 'Activity'
    const ongoing = start < today
    const description = ongoing
      ? `${type} in progress · finishes ${shortDate(finish)}`
      : start === finish
        ? `${type} · due ${shortDate(start)}`
        : `${type} · starts ${shortDate(start)}, finishes ${shortDate(finish)}`
    events.push({
      key: `s-${a.id}`,
      date: ongoing ? today : start,
      projectId: a.project_id,
      projectName: a.projectName ?? 'Project',
      title: a.name,
      description,
      href: `/projects/${a.project_id}/schedule?activity=${a.id}`,
      kind: 'schedule',
      tentative: false,
      assigneeName: a.assigned_to ? (input.assigneeNames?.get(a.assigned_to) ?? null) : null,
      responsibleUserId: a.assigned_to ?? null,
    })
  }

  for (const p of input.proposedStarts) {
    if (!PRE_START_STATUSES.has(p.status) || !inWindow(p.proposed_start_date)) continue
    events.push({
      key: `p-${p.id}`,
      date: p.proposed_start_date,
      projectId: p.id,
      projectName: p.name,
      title: 'Proposed project start',
      description: 'Proposed date only, not a confirmed start',
      href: `/projects/${p.id}`,
      kind: 'proposed_start',
      tentative: true,
      assigneeName: null,
      responsibleUserId: null,
    })
  }

  for (const w of input.warranties) {
    if (!inWindow(w.milestoneDueOn)) continue
    events.push({
      key: `w-${w.projectId}`,
      date: w.milestoneDueOn,
      projectId: w.projectId,
      projectName: w.projectName,
      title: w.milestoneLabel ?? 'Warranty milestone',
      description: w.coverageName ? `${w.coverageName} coverage milestone` : 'Warranty coverage milestone',
      href: `/projects/${w.projectId}/warranty`,
      kind: 'warranty',
      tentative: false,
      assigneeName: null,
      responsibleUserId: null,
    })
  }

  return events.sort((a, b) => a.date.localeCompare(b.date) || a.projectName.localeCompare(b.projectName) || a.key.localeCompare(b.key))
}
