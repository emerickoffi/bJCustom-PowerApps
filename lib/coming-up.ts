import { addIsoDays, type AgendaEntry } from './agenda.ts'
import type { ProjectStatus } from './domain.ts'

export const COMING_UP_DAYS = 21

export type ComingUpEvent = {
  key: string
  date: string
  projectId: string
  projectName: string
  title: string
  description: string
  href: string
  kind: 'schedule' | 'proposed_start' | 'warranty'
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

/**
 * Merges real upcoming dates from three existing sources: open schedule activities (already windowed by the agenda
 * builder), proposed starts on pre-construction projects (labelled as proposed, never as committed), and the next
 * unreached warranty milestone. Nothing is inferred; undated records are skipped.
 */
export function buildComingUp(input: {
  today: string
  days?: number
  agenda: AgendaEntry[]
  proposedStarts: ProposedStartInput[]
  warranties: WarrantyMilestoneInput[]
}): ComingUpEvent[] {
  const { today, days = COMING_UP_DAYS } = input
  const end = addIsoDays(today, days - 1)
  const inWindow = (d: string | null): d is string => !!d && d >= today && d <= end
  const events: ComingUpEvent[] = []

  for (const e of input.agenda) {
    if (e.kind === 'ongoing' || !inWindow(e.date)) continue
    const type = TYPE_LABEL[e.activity_type] ?? 'Activity'
    events.push({
      key: `s-${e.id}-${e.kind}`,
      date: e.date,
      projectId: e.project_id,
      projectName: e.projectName ?? 'Project',
      title: e.name,
      description: `${type} ${e.kind === 'due' ? 'planned to finish' : 'planned to start'}`,
      href: `/projects/${e.project_id}/schedule`,
      kind: 'schedule',
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
    })
  }

  return events.sort((a, b) => a.date.localeCompare(b.date) || a.projectName.localeCompare(b.projectName) || a.key.localeCompare(b.key))
}
