export const AGENDA_WEEK_DAYS = 7

export type AgendaActivity = {
  id: string
  project_id: string
  projectName: string | null
  name: string
  activity_type: string
  status: string
  planned_start: string | null
  planned_end: string | null
}

export type AgendaEntry = AgendaActivity & {
  /** The calendar date this entry is listed under. */
  date: string
  /** Starts, finishes, or continues on `date`. */
  kind: 'starts' | 'due' | 'ongoing'
}

export type Agenda = { today: AgendaEntry[]; week: AgendaEntry[] }

export function addIsoDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const KIND_ORDER = { due: 0, starts: 1, ongoing: 2 } as const

/**
 * Groups open, dated schedule activities into Today and the next seven days.
 * Undated activities are excluded rather than guessed; dates are calendar dates in the org's zone.
 */
export function buildAgenda(activities: AgendaActivity[], today: string): Agenda {
  const weekEnd = addIsoDays(today, AGENDA_WEEK_DAYS - 1)
  const todayEntries: AgendaEntry[] = []
  const week: AgendaEntry[] = []

  for (const a of activities) {
    if (a.status === 'completed' || a.status === 'skipped') continue
    const start = a.planned_start ?? a.planned_end
    const end = a.planned_end ?? a.planned_start
    if (!start || !end || end < today || start > weekEnd) continue

    if (start <= today && end >= today) {
      todayEntries.push({ ...a, date: today, kind: end === today ? 'due' : start === today ? 'starts' : 'ongoing' })
    }
    if (start > today) week.push({ ...a, date: start, kind: start === end ? 'due' : 'starts' })
    else if (end > today && end <= weekEnd) week.push({ ...a, date: end, kind: 'due' })
  }

  const sort = (x: AgendaEntry, y: AgendaEntry) =>
    x.date.localeCompare(y.date) || KIND_ORDER[x.kind] - KIND_ORDER[y.kind] || x.name.localeCompare(y.name)
  return { today: todayEntries.sort(sort), week: [...todayEntries, ...week].sort(sort) }
}
