/**
 * Shared rules for importing clients and projects from a CSV file. Pure, so node --test can load it.
 * The server re-runs every check with the real validation schemas before anything is saved.
 */
import { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS, type ProjectStatus } from './domain.ts'
import { toCsv } from './contacts.ts'

export type ImportField = { key: string; label: string; required?: boolean; aliases: readonly string[]; hint?: string }
export type ImportMapping = Record<string, number>
export type ImportValues = Record<string, string>
export type ImportRowInput = { line: number; values: ImportValues }
/** A row after server checks: errors block it, `skip` means it is a duplicate and is left out. */
export type CheckedImportRow = ImportRowInput & { errors: string[]; skip: string | null; note?: string }
export type ImportRowResult = { line: number; status: 'created' | 'skipped' | 'failed'; message?: string; id?: string }
export type ImportPreview = { ok: true; rows: CheckedImportRow[] } | { ok: false; error: string }
export type ImportOutcome = { ok: true; results: ImportRowResult[] } | { ok: false; error: string }

export const RECORD_IMPORT_MAX_ROWS = 500

// ───────── Fields ─────────

export const CLIENT_IMPORT_FIELDS: readonly ImportField[] = [
  { key: 'first_name', label: 'First Name', required: true, aliases: ['first', 'firstname', 'given name', 'owner first name'] },
  { key: 'last_name', label: 'Last Name', required: true, aliases: ['last', 'lastname', 'surname', 'family name', 'owner last name'] },
  { key: 'email', label: 'Email', aliases: ['email address', 'e-mail', 'client email'] },
  { key: 'phone', label: 'Phone', aliases: ['phone number', 'mobile', 'cell', 'primary phone', 'cell phone'] },
  { key: 'alternate_phone', label: 'Alternate Phone', aliases: ['secondary phone', 'work phone', 'home phone', 'alt phone'] },
  { key: 'company_name', label: 'Company', aliases: ['company name', 'business', 'organization'] },
  { key: 'address_line1', label: 'Street Address', aliases: ['address', 'address 1', 'address line 1', 'street', 'mailing address'] },
  { key: 'address_line2', label: 'Address Line 2', aliases: ['address 2', 'unit', 'suite', 'apt'] },
  { key: 'city', label: 'City', aliases: ['town'] },
  { key: 'state', label: 'State', aliases: ['state province', 'province', 'region'] },
  { key: 'postal_code', label: 'ZIP Code', aliases: ['zip', 'zipcode', 'postal code', 'postcode'] },
  { key: 'status', label: 'Status', aliases: ['client status'], hint: 'Lead, Active, Inactive or Archived. Empty = Active.' },
  { key: 'notes', label: 'Notes', aliases: ['note', 'comments'] },
]

export const PROJECT_IMPORT_FIELDS: readonly ImportField[] = [
  { key: 'name', label: 'Project Name', required: true, aliases: ['project', 'job', 'job name', 'name', 'project title'] },
  { key: 'client_email', label: 'Client Email', aliases: ['customer email', 'owner email', 'homeowner email'], hint: 'Links the project to an existing client.' },
  { key: 'client_name', label: 'Client Name', aliases: ['client', 'customer', 'customer name', 'owner', 'homeowner'], hint: 'Used when there is no email, e.g. "Jordan Lee".' },
  { key: 'project_type', label: 'Project Type', aliases: ['type', 'job type'], hint: 'New Custom Home, Renovation, Addition, Remodel or Other.' },
  { key: 'status', label: 'Status', aliases: ['project status', 'job status', 'stage'], hint: 'E.g. Planning, Under Construction. Empty = Planning.' },
  { key: 'address_line1', label: 'Street Address', required: true, aliases: ['address', 'address 1', 'job address', 'site address', 'street'] },
  { key: 'address_line2', label: 'Address Line 2', aliases: ['address 2', 'unit', 'suite'] },
  { key: 'city', label: 'City', required: true, aliases: ['town', 'job city'] },
  { key: 'state', label: 'State', required: true, aliases: ['job state', 'province'] },
  { key: 'postal_code', label: 'ZIP Code', required: true, aliases: ['zip', 'zipcode', 'postal code', 'job zip'] },
  { key: 'estimated_budget', label: 'Budget', aliases: ['contract amount', 'contract price', 'contract value', 'estimated budget', 'price', 'amount'] },
  { key: 'proposed_start_date', label: 'Start Date', aliases: ['start', 'projected start', 'start date'] },
  { key: 'target_completion_date', label: 'Completion Date', aliases: ['end date', 'finish date', 'projected completion', 'target completion', 'completion'] },
  { key: 'project_manager_email', label: 'Project Manager Email', aliases: ['project manager', 'pm', 'pm email', 'manager email'], hint: 'Must be an administrator or project manager in Trefort.' },
  { key: 'lot', label: 'Lot', aliases: ['lot number'] },
  { key: 'block', label: 'Block', aliases: [] },
  { key: 'community', label: 'Community', aliases: ['subdivision', 'neighborhood', 'development'] },
  { key: 'description', label: 'Description', aliases: ['scope', 'project description'] },
  { key: 'internal_notes', label: 'Internal Notes', aliases: ['notes', 'note', 'comments'] },
]

export function clientImportTemplateCsv(): string {
  return toCsv(
    CLIENT_IMPORT_FIELDS.map((f) => f.label),
    [['Jordan', 'Lee', 'jordan@example.com', '512-555-0142', '', '', '1208 Yaupon Dr', '', 'Austin', 'TX', '78745', 'Active', '']],
  )
}

export function projectImportTemplateCsv(): string {
  return toCsv(
    PROJECT_IMPORT_FIELDS.map((f) => f.label),
    [['Lee Residence', 'jordan@example.com', 'Jordan Lee', 'New Custom Home', 'Under Construction', '1208 Yaupon Dr', '', 'Austin', 'TX', '78745', '650000', '2026-09-01', '2027-06-30', '', '', '', '', '', '']],
  )
}

// ───────── Mapping ─────────

function normHeader(h: string) {
  return h.toLowerCase().replace(/[_\-./]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export function guessImportMapping(fields: readonly ImportField[], headers: string[]): ImportMapping {
  const mapping: ImportMapping = {}
  const used = new Set<number>()
  const normalized = headers.map(normHeader)
  for (const field of fields) {
    const candidates = [normHeader(field.label), normHeader(field.key), ...field.aliases.map(normHeader)]
    const index = normalized.findIndex((h, i) => !used.has(i) && candidates.includes(h))
    if (index >= 0) {
      mapping[field.key] = index
      used.add(index)
    }
  }
  return mapping
}

export function applyImportMapping(fields: readonly ImportField[], rows: string[][], mapping: ImportMapping): ImportRowInput[] {
  return rows.slice(0, RECORD_IMPORT_MAX_ROWS).map((cells, i) => {
    const values: ImportValues = {}
    for (const f of fields) {
      const index = mapping[f.key]
      values[f.key] = index === undefined ? '' : (cells[index] ?? '').trim()
    }
    return { line: i + 2, values }
  })
}

/** Keeps only known keys, as trimmed strings, so the server never trusts the browser's shape. */
export function cleanImportRows(fields: readonly ImportField[], rows: unknown): ImportRowInput[] | null {
  if (!Array.isArray(rows) || rows.length > RECORD_IMPORT_MAX_ROWS) return null
  return rows.map((r, i) => {
    const raw = (r && typeof r === 'object' ? (r as { values?: unknown; line?: unknown }) : {}) as { values?: unknown; line?: unknown }
    const src = raw.values && typeof raw.values === 'object' ? (raw.values as Record<string, unknown>) : {}
    const values: ImportValues = {}
    for (const f of fields) values[f.key] = typeof src[f.key] === 'string' ? (src[f.key] as string).trim().slice(0, 4000) : ''
    const line = Number(raw.line)
    return { line: Number.isInteger(line) && line > 0 ? line : i + 2, values }
  })
}

// ───────── Value normalizers ─────────

const squash = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** YYYY-MM-DD from ISO or US dates (M/D/YYYY, M/D/YY, M-D-YYYY). '' stays ''. Null when not a real date. */
export function normalizeImportDate(input: string): string | null {
  const v = input.trim()
  if (!v) return ''
  let y: number, m: number, d: number
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(v)
  const us = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(v)
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  else if (us) {
    ;[m, d, y] = [Number(us[1]), Number(us[2]), Number(us[3])]
    if (us[3].length === 2) y += y >= 70 ? 1900 : 2000
  } else return null
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export const CLIENT_IMPORT_STATUSES = ['lead', 'active', 'inactive', 'archived'] as const

export function normalizeClientStatus(input: string): (typeof CLIENT_IMPORT_STATUSES)[number] | null {
  const v = squash(input)
  if (!v) return 'active'
  return (CLIENT_IMPORT_STATUSES as readonly string[]).includes(v) ? (v as (typeof CLIENT_IMPORT_STATUSES)[number]) : null
}

/** Completed is left out on purpose: finishing a job goes through the completion review in Trefort. */
export const PROJECT_IMPORT_STATUSES = (Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]).filter((s) => s !== 'completed')

export function normalizeProjectStatus(input: string): ProjectStatus | 'completed' | null {
  const v = squash(input)
  if (!v) return 'planning'
  if (v === 'completed' || v === 'complete' || v === 'closed') return 'completed'
  if (v === 'in progress' || v === 'active' || v === 'construction') return 'under_construction'
  for (const [key, label] of Object.entries(PROJECT_STATUS_LABELS)) {
    if (v === squash(key) || v === squash(label)) return key as ProjectStatus
  }
  return null
}

export function normalizeProjectType(input: string): string | null {
  const v = squash(input)
  if (!v) return 'other'
  if (v === 'new home' || v === 'custom home' || v === 'new construction') return 'new_custom_home'
  for (const [key, label] of Object.entries(PROJECT_TYPE_LABELS)) {
    if (v === squash(key) || v === squash(label)) return key
  }
  return null
}

// ───────── Matching ─────────

export const normEmail = (v: string | null | undefined) => (v ?? '').trim().toLowerCase()
export const normName = (v: string | null | undefined) => (v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export type ClientRef = { id: string; first_name: string; last_name: string; email: string | null; company_name?: string | null }

/**
 * Finds the client a project row points to: by email first, then by full name ("First Last" or the company name).
 * Ambiguous names are an error rather than a guess.
 */
export function matchClient(
  clients: readonly ClientRef[],
  email: string,
  name: string,
): { id: string } | { error: string } | null {
  const e = normEmail(email)
  if (e) {
    const byEmail = clients.filter((c) => normEmail(c.email) === e)
    if (byEmail.length === 1) return { id: byEmail[0].id }
    if (byEmail.length > 1) return { error: `Client Email: more than one client uses ${email}` }
    if (!name.trim()) return { error: `Client Email: no client with ${email}. Import clients first.` }
  }
  const n = normName(name)
  if (!n) return null
  const byName = clients.filter((c) => normName(`${c.first_name} ${c.last_name}`) === n || (c.company_name && normName(c.company_name) === n))
  if (byName.length === 1) return { id: byName[0].id }
  if (byName.length > 1) return { error: `Client Name: more than one client is named ${name}. Add a Client Email column.` }
  return { error: `Client: no client named ${name}. Import clients first.` }
}

/** Projects already in Trefort, or earlier in the file, with the same name at the same street address. */
export function projectKey(name: string, address: string): string {
  return `${normName(name)}|${normName(address)}`
}
