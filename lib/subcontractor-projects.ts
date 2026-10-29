export const MAX_PROJECT_ASSIGNMENTS = 50

export type AssignableProject = {
  id: string
  name: string
  project_number: string
  status: string
}

export type AssignedProject = { id: string; name: string; project_number: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

/** The two Supabase migrations that must both be applied before project assignments work. */
export const PROJECT_ASSIGNMENT_MIGRATIONS = [
  '20261101000010_subcontractor_project_assignments.sql',
  '20261104000010_subcontractor_project_assignment_history.sql',
] as const

/**
 * True when an error means the assignment storage is missing or out of date: missing table, column, or function.
 * Any of these means an administrator still has to apply PROJECT_ASSIGNMENT_MIGRATIONS.
 */
export function isAssignmentSetupError(error: { code?: string } | null | undefined): boolean {
  const code = error?.code
  return code === 'PGRST205' || code === '42P01' || code === '42703' || code === 'PGRST204' || code === 'PGRST202'
}

export const MAX_END_REASON_LENGTH = 500

export type ProjectAssignmentRecord = {
  assignment_id: string
  project: AssignableProject
  associated_at: string
  ended_at: string | null
  end_reason: string | null
}

/**
 * Current = not ended and the project is still in an assignable stage. Everything else (ended associations, and
 * associations on completed, cancelled, or archived projects) is read-only history, newest first.
 */
export function splitProjectAssignments(
  records: readonly ProjectAssignmentRecord[],
  acceptsNewAssignments: (status: string) => boolean,
): { current: ProjectAssignmentRecord[]; history: ProjectAssignmentRecord[] } {
  const current: ProjectAssignmentRecord[] = []
  const history: ProjectAssignmentRecord[] = []
  for (const r of records) {
    ;(!r.ended_at && acceptsNewAssignments(r.project.status) ? current : history).push(r)
  }
  current.sort((a, b) => a.project.project_number.localeCompare(b.project.project_number, undefined, { numeric: true }))
  history.sort((a, b) => (b.ended_at ?? b.associated_at).localeCompare(a.ended_at ?? a.associated_at))
  return { current, history }
}

/** Trims an optional end reason. Returns null for blank, or an error when it is too long. */
export function parseEndReason(raw: unknown): { ok: true; reason: string | null } | { ok: false; error: string } {
  if (raw !== undefined && raw !== null && typeof raw !== 'string') return { ok: false, error: 'Reason is not valid' }
  const reason = (raw ?? '').trim()
  if (reason.length > MAX_END_REASON_LENGTH) {
    return { ok: false, error: `Keep the reason to ${MAX_END_REASON_LENGTH} characters or fewer` }
  }
  return { ok: true, reason: reason || null }
}

/**
 * Returns the submitted IDs that do not already have an ACTIVE association, preserving submission order, so a
 * project is never assigned twice at once. Ended associations do not block re-adding a project.
 */
export function newProjectIds(existingIds: readonly string[], submittedIds: readonly string[]): string[] {
  const existing = new Set(existingIds.map((id) => id.toLowerCase()))
  return submittedIds.filter((id) => !existing.has(id.toLowerCase()))
}

export type ProjectIdParse = { ok: true; ids: string[] } | { ok: false; error: string }

/** Trims, de-duplicates, and validates submitted project IDs. An empty selection is valid. */
export function parseProjectIds(raw: readonly unknown[]): ProjectIdParse {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const value of raw) {
    if (typeof value !== 'string') return { ok: false, error: 'One of the selected projects is not valid' }
    const id = value.trim().toLowerCase()
    if (!id) continue
    if (!UUID_RE.test(id)) return { ok: false, error: 'One of the selected projects is not valid' }
    if (!seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }
  if (ids.length > MAX_PROJECT_ASSIGNMENTS) {
    return { ok: false, error: `Choose ${MAX_PROJECT_ASSIGNMENTS} projects or fewer` }
  }
  return { ok: true, ids }
}

/**
 * Confirms every requested project was returned by an authorized, organization-scoped lookup and accepts new
 * assignments. Returns an error message, or null when the selection is valid.
 */
export function checkSelectedProjects(
  ids: readonly string[],
  authorizedRows: readonly { id: string; status: string }[],
  acceptsNewAssignments: (status: string) => boolean,
): string | null {
  const byId = new Map(authorizedRows.map((row) => [row.id.toLowerCase(), row]))
  for (const id of ids) {
    const row = byId.get(id)
    if (!row) return 'One or more selected projects are not available to your company'
    if (!acceptsNewAssignments(row.status)) {
      return 'Subcontractors can only be assigned to projects in preconstruction, construction, or closeout'
    }
  }
  return null
}

/** Groups association rows into a per-company list of projects, sorted by project number. */
export function groupAssignedProjects(
  rows: readonly { subcontractor_company_id: string; project: AssignedProject | null }[],
): Record<string, AssignedProject[]> {
  const grouped: Record<string, AssignedProject[]> = {}
  for (const row of rows) {
    if (!row.project) continue
    ;(grouped[row.subcontractor_company_id] ??= []).push(row.project)
  }
  for (const list of Object.values(grouped)) {
    list.sort((a, b) => a.project_number.localeCompare(b.project_number, undefined, { numeric: true }))
  }
  return grouped
}
