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

/**
 * Project associations are append-only history, so an edit can only add projects. Returns the submitted IDs that
 * are not already associated, preserving submission order. Existing associations are never removed.
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
