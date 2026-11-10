import { CONTACT_RELATIONSHIP_LABELS, PROJECT_CLIENT_RELATIONSHIP_LABELS } from './domain.ts'
import { formatDate } from './format.ts'
import { isRfiOverdue, responderLabel, rfiRef, rfisPath, type RfiListRow } from './rfis.ts'
import { isOverdue, todayIso, type ActivityStatus } from './schedule.ts'

/** Namespaced so it never collides with the `project` filter that drives the global project selector. */
export const PREVIEW_PARAM = 'previewProject'
export const PREVIEW_PANEL_ID = 'project-preview'
export const PREVIEW_PHOTO_LIMIT = 3
export const PREVIEW_SUMMARY_MAX = 240
export const PREVIEW_SUBCONTRACTOR_LIMIT = 3
export const PREVIEW_QUESTION_LIMIT = 3
/** Below this many assignments the full list is short enough to scan without a search box. */
export const SUBCONTRACTOR_SEARCH_MIN = 6

export type PreviewActivityRow = {
  id: string
  name: string
  status: ActivityStatus
  planned_start: string | null
  planned_end: string | null
  activity_type: string
  assigned_to: string | null
}

export type PreviewNextActivity =
  | { state: 'off' | 'error' | 'empty' | 'complete'; scheduleHref: string }
  | {
      state: 'undated'
      scheduleHref: string
      openCount: number
      /** The first open activity in schedule order, so the planning step says where to start. */
      firstName: string | null
    }
  | {
      state: 'ready'
      scheduleHref: string
      href: string
      name: string
      milestone: boolean
      plannedLabel: string
      status: ActivityStatus
      overdue: boolean
      /** The assigned person and companies, or null when nobody is assigned. */
      assignedTo: string | null
    }

export type PreviewPhoto = { id: string; url: string; alt: string }

export type PreviewLatestUpdate =
  /** `off`: the module is disabled or this viewer cannot read daily logs, so the section is not shown at all. */
  | { state: 'off' | 'error' | 'empty' }
  | {
      state: 'ready'
      href: string
      dateLabel: string
      draft: boolean
      /** Null when the log has no written notes yet. */
      summary: string | null
      photos: PreviewPhoto[]
      morePhotos: number
      /** The photo lookup failed, so an empty strip must not read as "no photos". */
      photosFailed: boolean
    }

export type PreviewPerson = {
  name: string
  /** How this person relates to the project, when it is not already said by their row label. */
  detail: string | null
  email: string | null
  phone: string | null
}

export type PreviewHomeowners =
  | { state: 'error' }
  | { state: 'ready'; primary: PreviewPerson | null; secondary: PreviewPerson | null; otherCount: number }

export type PreviewSubcontractor = {
  key: string
  /** A company assignment covers the company only; its people appear when they are assigned individually. */
  kind: 'company' | 'person'
  name: string
  /** The company an individual works on behalf of. Always null for a company assignment. */
  company: string | null
  trade: string | null
  /** An individual's role on this project. */
  role: string | null
  /** The directory record, for viewers who may open it. */
  href: string | null
}

export type PreviewSubcontractors =
  /** `unavailable`: the business directory is not set up for this organization. */
  | { state: 'error' | 'unavailable' }
  | { state: 'ready'; items: PreviewSubcontractor[] }

export type PreviewPeople = {
  manager: PreviewPerson | null
  homeowners: PreviewHomeowners
  subcontractors: PreviewSubcontractors
  canAssign: boolean
  /** Why a manager cannot assign to this project right now. */
  assignNote: string | null
  peopleHref: string
}

export type PreviewQuestion = {
  id: string
  ref: string
  subject: string
  responsible: string
  context: string
  overdue: boolean
  href: string
}

export type PreviewQuestions =
  /** `off`: the module is disabled, not set up, or this viewer cannot read the project's questions. */
  | { state: 'off' | 'error' }
  | { state: 'ready'; items: PreviewQuestion[]; total: number; href: string }

export type ProjectPreview = {
  id: string
  /** Null when the project has no address on file. */
  address: string | null
  people: PreviewPeople
  nextActivity: PreviewNextActivity
  latestUpdate: PreviewLatestUpdate
  questions: PreviewQuestions
}

export function previewApiPath(projectId: string) {
  return `/api/projects/${encodeURIComponent(projectId)}/preview`
}

export function assignmentDirectoryApiPath(projectId: string) {
  return `/api/projects/${encodeURIComponent(projectId)}/assignment-directory`
}

/** Same selection as the Overview schedule snapshot: the earliest dated activity that is neither complete nor skipped. */
export function pickNextActivity<T extends Pick<PreviewActivityRow, 'status' | 'planned_start' | 'planned_end'>>(
  activities: T[],
): { state: 'empty' | 'complete' } | { state: 'undated'; first: T } | { state: 'ready'; activity: T } {
  const counted = activities.filter((a) => a.status !== 'skipped')
  if (!counted.length) return { state: 'empty' }
  const open = counted.filter((a) => a.status !== 'completed')
  const dated = open
    .filter((a) => a.planned_start || a.planned_end)
    .sort((a, b) => (a.planned_start ?? a.planned_end ?? '').localeCompare(b.planned_start ?? b.planned_end ?? ''))
  if (dated[0]) return { state: 'ready', activity: dated[0] }
  return open[0] ? { state: 'undated', first: open[0] } : { state: 'complete' }
}

export function plannedLabel(a: Pick<PreviewActivityRow, 'planned_start' | 'planned_end'>) {
  if (a.planned_start && a.planned_end && a.planned_start !== a.planned_end) {
    return `${formatDate(a.planned_start)} – ${formatDate(a.planned_end)}`
  }
  if (a.planned_end) return `Planned ${formatDate(a.planned_end)}`
  return `Starts ${formatDate(a.planned_start)}`
}

export function isPastPlannedFinish(a: Pick<PreviewActivityRow, 'status' | 'planned_end'>, today = todayIso()) {
  return isOverdue(a, today)
}

/** The person and companies working an activity as one label, each named once. */
export function activityAssignees(personName: string | null, companyNames: readonly (string | null | undefined)[]): string | null {
  const seen = new Set<string>()
  const names = [personName, ...companyNames].flatMap((value) => {
    const name = value?.trim()
    if (!name || seen.has(name.toLowerCase())) return []
    seen.add(name.toLowerCase())
    return [name]
  })
  return names.length ? names.join(' · ') : null
}

/** First written field of a daily log, flattened to one line and capped for the preview. */
export function dailyLogSummary(log: {
  work_performed: string | null
  progress_notes: string | null
  weather_conditions: string | null
}): string | null {
  const text = [log.work_performed, log.progress_notes, log.weather_conditions]
    .map((value) => (value ?? '').replace(/\s+/g, ' ').trim())
    .find(Boolean)
  if (!text) return null
  return text.length > PREVIEW_SUMMARY_MAX ? `${text.slice(0, PREVIEW_SUMMARY_MAX - 1).trimEnd()}…` : text
}

export type HomeownerGroupInput = {
  linkId: string
  linkRelationship: string
  client: { name: string; email: string | null; phone: string | null } | null
  contacts: { id: string; name: string; relationship: string; email: string | null; phone: string | null; isPrimary: boolean }[]
}

/**
 * The primary homeowner and one clearly labeled secondary contact. The primary owner's household comes first,
 * then any co-owners, each person counted once.
 */
export function pickHomeowners(groups: readonly HomeownerGroupInput[]): {
  primary: PreviewPerson | null
  secondary: PreviewPerson | null
  otherCount: number
} {
  const ordered = [...groups].sort(
    (a, b) => Number(b.linkRelationship === 'primary_owner') - Number(a.linkRelationship === 'primary_owner'),
  )
  const seen = new Set<string>()
  const people: PreviewPerson[] = []
  ordered.forEach((group, groupIndex) => {
    const linkLabel = groupIndex === 0 ? null : (PROJECT_CLIENT_RELATIONSHIP_LABELS[group.linkRelationship] ?? null)
    const entries = group.contacts.length
      ? [...group.contacts]
          .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
          .map((c) => ({
            key: `contact:${c.id}`,
            name: c.name,
            detail: c.isPrimary ? linkLabel : (CONTACT_RELATIONSHIP_LABELS[c.relationship] ?? (c.relationship || null)),
            email: c.email,
            phone: c.phone,
          }))
      : group.client
        ? [{ key: `link:${group.linkId}`, name: group.client.name, detail: linkLabel, email: group.client.email, phone: group.client.phone }]
        : []
    for (const { key, ...person } of entries) {
      if (seen.has(key) || !person.name.trim()) continue
      seen.add(key)
      people.push(person)
    }
  })
  return { primary: people[0] ?? null, secondary: people[1] ?? null, otherCount: Math.max(0, people.length - 2) }
}

export type SubcontractorCompanyRow = { subcontractor_company_id: string; company_name: string | null; trade: string | null }
export type SubcontractorPersonRow = {
  person_id: string
  name: string
  project_role: string | null
  company_name: string | null
  trade: string | null
}

const clean = (value: string | null | undefined) => value?.trim() || null
const byName = (a: PreviewSubcontractor, b: PreviewSubcontractor) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

/**
 * One entry per active assignment: companies first, then individuals. Joined rows can repeat a record, so each
 * company and each person is kept once and the total is the length of this list.
 */
export function buildSubcontractorEntries(
  companies: readonly SubcontractorCompanyRow[],
  people: readonly SubcontractorPersonRow[],
  hrefs: { company: ((subcontractorCompanyId: string) => string) | null; person: ((personId: string) => string) | null },
): PreviewSubcontractor[] {
  const companyEntries = new Map<string, PreviewSubcontractor>()
  for (const row of companies) {
    if (companyEntries.has(row.subcontractor_company_id)) continue
    companyEntries.set(row.subcontractor_company_id, {
      key: `company:${row.subcontractor_company_id}`,
      kind: 'company',
      name: clean(row.company_name) ?? 'Subcontractor',
      company: null,
      trade: clean(row.trade),
      role: null,
      href: hrefs.company?.(row.subcontractor_company_id) ?? null,
    })
  }
  const personEntries = new Map<string, PreviewSubcontractor>()
  for (const row of people) {
    if (personEntries.has(row.person_id)) continue
    const name = clean(row.name) ?? 'Unknown contact'
    const company = clean(row.company_name)
    personEntries.set(row.person_id, {
      key: `person:${row.person_id}`,
      kind: 'person',
      name,
      company: company && company.toLowerCase() !== name.toLowerCase() ? company : null,
      trade: clean(row.trade),
      role: clean(row.project_role),
      href: hrefs.person?.(row.person_id) ?? null,
    })
  }
  return [...[...companyEntries.values()].sort(byName), ...[...personEntries.values()].sort(byName)]
}

/** The supporting line under an entry's name. A value already shown is not repeated. */
export function subcontractorDetails(entry: PreviewSubcontractor): string[] {
  const seen = new Set([entry.name.toLowerCase()])
  return [entry.role, entry.company, entry.trade].flatMap((value) => {
    if (!value || seen.has(value.toLowerCase())) return []
    seen.add(value.toLowerCase())
    return [value]
  })
}

export function filterSubcontractors(items: readonly PreviewSubcontractor[], query: string): PreviewSubcontractor[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...items]
  return items.filter((item) =>
    [item.name, item.company, item.trade, item.role, item.kind === 'company' ? 'company' : null]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q),
  )
}

export type PendingQuestionRow = Pick<
  RfiListRow,
  'id' | 'rfi_number' | 'status' | 'subject' | 'responder_name' | 'responder_company' | 'due_date' | 'updated_at'
>

/**
 * Sent questions that still need someone: overdue ones first, then answers waiting for review, then the rest by
 * due date. Drafts and closed questions never appear.
 */
export function pickPendingQuestions(
  rows: readonly PendingQuestionRow[],
  projectId: string,
  today = todayIso(),
  limit = PREVIEW_QUESTION_LIMIT,
): PreviewQuestion[] {
  const rank = (row: PendingQuestionRow) => (isRfiOverdue(row.status, row.due_date, today) ? 0 : row.status === 'answered' ? 1 : 2)
  return rows
    .filter((row) => row.status === 'open' || row.status === 'answered')
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31') ||
        a.updated_at.localeCompare(b.updated_at),
    )
    .slice(0, limit)
    .map((row) => {
      const overdue = isRfiOverdue(row.status, row.due_date, today)
      return {
        id: row.id,
        ref: rfiRef(row.rfi_number),
        subject: row.subject,
        responsible: responderLabel(row),
        context:
          row.status === 'answered'
            ? 'Answered · waiting for review'
            : overdue
              ? `Overdue · was due ${formatDate(row.due_date)}`
              : row.due_date
                ? `Open · due ${formatDate(row.due_date)}`
                : 'Open · no due date',
        overdue,
        href: rfisPath(projectId, row.id),
      }
    })
}

/** What the panel says for a failed request, and whether trying again can help. */
export function previewErrorState(status: number | null): { message: string; retry: boolean } {
  if (status === 401) return { message: 'Your session has ended. Sign in again to see this project.', retry: false }
  if (status === 403) return { message: 'You do not have access to this project.', retry: false }
  if (status === 404) return { message: 'This project is no longer available.', retry: false }
  return { message: 'Project details could not be loaded.', retry: true }
}

/** Same, for the directory the assignment view loads. A 409 carries the server's reason the project cannot take assignments. */
export function assignmentDirectoryErrorState(status: number | null, reason?: string | null): { message: string; retry: boolean } {
  if (status === 401) return { message: 'Your session has ended. Sign in again to assign subcontractors.', retry: false }
  if (status === 403) return { message: 'Your role does not allow assigning people or companies to projects.', retry: false }
  if (status === 404) return { message: 'This project is no longer available.', retry: false }
  if (status === 409) return { message: reason?.trim() || 'This project cannot take new assignments right now.', retry: false }
  return { message: 'The directory could not be loaded.', retry: true }
}
