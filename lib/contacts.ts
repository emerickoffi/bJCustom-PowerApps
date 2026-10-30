import { z } from 'zod'

export type ContactStatus = 'active' | 'inactive'
export type DirectoryView = 'all' | 'people' | 'companies'
export type CategoryKey = 'professionals' | 'suppliers' | 'subcontractors' | 'other'

export const DIRECTORY_VIEWS: { value: DirectoryView; label: string }[] = [
  { value: 'all', label: 'All Contacts' },
  { value: 'people', label: 'People' },
  { value: 'companies', label: 'Companies' },
]

/** Business categories are stored as `business_categories` rows (kind = 'business') named with these labels. */
export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  professionals: 'Professionals',
  suppliers: 'Suppliers',
  subcontractors: 'Subcontractors',
  other: 'Other',
}
export const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS) as CategoryKey[]

export function categoryKeyFromName(name: string | null | undefined): CategoryKey | null {
  const n = (name ?? '').trim().toLowerCase()
  return CATEGORY_KEYS.find((k) => CATEGORY_LABELS[k].toLowerCase() === n) ?? null
}

export const SUBCONTRACTOR_CONTACT_ROLES = [
  'Owner',
  'Foreman',
  'Supervisor',
  'Estimator',
  'Office Contact',
  'Billing Contact',
  'Other',
] as const

export const SUPPLIER_CONTACT_ROLES = [
  'Owner',
  'Sales Representative',
  'Account Manager',
  'Purchasing Contact',
  'Billing Contact',
  'Other',
] as const

/** Business professions. Separate from homeowner additional-contact relationships. */
export const PROFESSIONAL_SPECIALTIES = [
  'Lawyer',
  'Banker',
  'Realtor',
  'Architect',
  'Engineer',
  'Surveyor',
  'Insurance Agent',
  'Mortgage Broker',
  'Inspector',
  'Consultant',
  'Other',
] as const

export const COMPANY_CONTACT_ROLES = [...new Set<string>([...SUBCONTRACTOR_CONTACT_ROLES, ...SUPPLIER_CONTACT_ROLES])]

export function parseView(raw: string | undefined | null): DirectoryView {
  return raw === 'people' || raw === 'companies' ? raw : 'all'
}

export function parseCategory(raw: string | undefined | null): CategoryKey | null {
  return CATEGORY_KEYS.includes(raw as CategoryKey) ? (raw as CategoryKey) : null
}

// ============ Validation ============

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null))

const optionalEmail = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => (v ? v.toLowerCase() : null))
  .refine((v) => v === null || (v.length <= 254 && z.email().safeParse(v).success), 'Enter a valid email address')

const optionalPhone = optionalText(30).refine(
  (v) => v === null || /^[0-9+().\-\s]{7,30}$/.test(v),
  'Enter a valid phone number',
)

const requiredName = (label: string) =>
  z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`).max(80, 'Must be 80 characters or fewer')

export const personSchema = z.object({
  first_name: requiredName('First name'),
  last_name: requiredName('Last name'),
  middle_name: optionalText(80),
  email: optionalEmail,
  primary_phone: optionalPhone,
  secondary_phone: optionalPhone,
  specialty: optionalText(120),
  notes: optionalText(2000),
})
export type PersonInput = z.infer<typeof personSchema>

export const companySchema = z.object({
  company_name: z.string({ error: 'Company name is required' }).trim().min(1, 'Company name is required').max(160),
  company_email: optionalEmail,
  company_phone: optionalPhone,
  secondary_company_phone: optionalPhone,
  website: optionalText(200).refine(
    (v) => v === null || /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(v),
    'Enter a valid website, for example example.com',
  ),
  address_line1: optionalText(160),
  city: optionalText(80),
  state: optionalText(40),
  postal_code: optionalText(20),
  notes: optionalText(2000),
})
export type CompanyInput = z.infer<typeof companySchema>

export const roleSchema = optionalText(120)
export const projectRoleSchema = z
  .string({ error: 'Project role is required' })
  .trim()
  .min(1, 'Project role is required')
  .max(120, 'Must be 120 characters or fewer')

export const INLINE_PERSON_FIELDS = [
  'first_name',
  'last_name',
  'email',
  'primary_phone',
  'secondary_phone',
  'specialty',
] as const
export type InlinePersonField = (typeof INLINE_PERSON_FIELDS)[number]

export function isInlinePersonField(value: unknown): value is InlinePersonField {
  return INLINE_PERSON_FIELDS.includes(value as InlinePersonField)
}

export function validateInlineField(
  field: InlinePersonField,
  raw: unknown,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (typeof raw !== 'string' && raw !== null) return { ok: false, error: 'Enter a value' }
  const result = personSchema.shape[field].safeParse(raw ?? '')
  if (!result.success) return { ok: false, error: result.error.issues[0]?.message ?? 'Enter a valid value' }
  return { ok: true, value: result.data as string | null }
}

/** Product categories arrive as a comma separated list; trims, de-duplicates (case-insensitive), and caps. */
export function parseProductCategories(raw: string | null | undefined): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of (raw ?? '').split(',')) {
    const name = part.trim().replace(/\s+/g, ' ').slice(0, 60)
    if (!name || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    out.push(name)
    if (out.length >= 20) break
  }
  return out
}

// ============ View models ============

export type PersonCompanyLink = {
  relationship_id: string
  company_id: string
  company_name: string
  role: string | null
  is_primary_contact: boolean
}

export type ProjectLink = {
  association_id?: string
  project_id: string
  name: string
  project_number: string | null
  role?: string | null
}

export type PersonView = {
  id: string
  first_name: string
  last_name: string
  email: string | null
  primary_phone: string | null
  secondary_phone: string | null
  specialty: string | null
  status: ContactStatus
  updated_at: string
  companies: PersonCompanyLink[]
  categories: CategoryKey[]
  projects: ProjectLink[]
}

export type CompanyView = {
  id: string
  company_name: string
  company_email: string | null
  company_phone: string | null
  status: ContactStatus
  subcontractor_company_id: string | null
  categories: CategoryKey[]
  product_categories: string[]
  primary_contact: { person_id: string; name: string } | null
  contact_count: number
  projects: ProjectLink[]
}

export function personName(p: { first_name: string; last_name: string }): string {
  return `${p.first_name} ${p.last_name}`.trim()
}

/** "ABC Lumber", "ABC Lumber +2", or an em dash for independent contacts. */
export function companySummary(names: string[]): string {
  if (!names.length) return '—'
  return names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`
}

export function projectCountLabel(count: number): string {
  if (count <= 0) return 'Not assigned'
  return count === 1 ? '1 project' : `${count} projects`
}

/**
 * A person's categories come from the companies they currently work with. Independent people with a specialty are
 * treated as Professionals; anyone else without a company is Other.
 */
export function derivePersonCategories(companyCategories: CategoryKey[][], specialty: string | null): CategoryKey[] {
  const set = new Set<CategoryKey>(companyCategories.flat())
  if (!set.size) set.add(specialty ? 'professionals' : 'other')
  return CATEGORY_KEYS.filter((k) => set.has(k))
}

/** Companies with no explicit category fall back to Subcontractors (when linked) or Other. */
export function deriveCompanyCategories(explicit: CategoryKey[], isSubcontractor: boolean): CategoryKey[] {
  const set = new Set<CategoryKey>(explicit)
  if (isSubcontractor) set.add('subcontractors')
  if (!set.size) set.add('other')
  return CATEGORY_KEYS.filter((k) => set.has(k))
}

/** Unique by project id, sorted by project number then name. */
export function uniqueProjects(projects: ProjectLink[]): ProjectLink[] {
  const map = new Map<string, ProjectLink>()
  for (const p of projects) if (!map.has(p.project_id)) map.set(p.project_id, p)
  return [...map.values()].sort(
    (a, b) => (a.project_number ?? '').localeCompare(b.project_number ?? '') || a.name.localeCompare(b.name),
  )
}

// ============ Search, filter, sort ============

export type StatusFilter = 'active' | 'inactive' | 'all'

export type DirectoryRow =
  | { kind: 'person'; id: string; person: PersonView }
  | { kind: 'company'; id: string; company: CompanyView }

export function normalizeQuery(raw: string): string[] {
  return raw.toLowerCase().trim().split(/\s+/).filter(Boolean).slice(0, 8)
}

function digits(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '')
}

function haystack(row: DirectoryRow): { text: string; phones: string } {
  if (row.kind === 'person') {
    const p = row.person
    return {
      text: [
        p.first_name,
        p.last_name,
        p.email,
        p.specialty,
        ...p.companies.map((c) => `${c.company_name} ${c.role ?? ''}`),
        ...p.projects.map((pr) => `${pr.name} ${pr.project_number ?? ''}`),
      ]
        .join(' ')
        .toLowerCase(),
      phones: `${digits(p.primary_phone)} ${digits(p.secondary_phone)}`,
    }
  }
  const c = row.company
  return {
    text: [c.company_name, c.company_email, c.primary_contact?.name, ...c.product_categories, ...c.projects.map((p) => p.name)]
      .join(' ')
      .toLowerCase(),
    phones: digits(c.company_phone),
  }
}

/** Every term must match the row's text, or (for numeric terms of 3+ digits) one of its phone numbers. */
export function matchesQuery(row: DirectoryRow, terms: string[]): boolean {
  if (!terms.length) return true
  const { text, phones } = haystack(row)
  return terms.every((term) => {
    if (text.includes(term)) return true
    const d = digits(term)
    return d.length >= 3 && d.length === term.replace(/[\s().+-]/g, '').length && phones.includes(d)
  })
}

export function rowStatus(row: DirectoryRow): ContactStatus {
  return row.kind === 'person' ? row.person.status : row.company.status
}

export function rowCategories(row: DirectoryRow): CategoryKey[] {
  return row.kind === 'person' ? row.person.categories : row.company.categories
}

export function filterRows(
  rows: DirectoryRow[],
  opts: { query: string; status: StatusFilter; category: CategoryKey | null },
): DirectoryRow[] {
  const terms = normalizeQuery(opts.query)
  return rows.filter(
    (row) =>
      (opts.status === 'all' || rowStatus(row) === opts.status) &&
      (!opts.category || rowCategories(row).includes(opts.category)) &&
      matchesQuery(row, terms),
  )
}

export type AttributeFilters = {
  specialty?: string
  product?: string
  companyId?: string
  projectId?: string
}

/**
 * Narrows rows by trade/specialty, product category, company, and project. A person matches a product category when
 * one of their current companies carries it; a company matches a specialty when one of its product/trade categories does.
 */
export function filterByAttributes(rows: DirectoryRow[], f: AttributeFilters, companies: CompanyView[]): DirectoryRow[] {
  if (!f.specialty && !f.product && !f.companyId && !f.projectId) return rows
  const productsByCompany = new Map(companies.map((c) => [c.id, c.product_categories.map((p) => p.toLowerCase())]))
  const specialty = f.specialty?.toLowerCase()
  const product = f.product?.toLowerCase()
  return rows.filter((row) => {
    if (row.kind === 'person') {
      const p = row.person
      if (specialty && (p.specialty ?? '').toLowerCase() !== specialty) return false
      if (product && !p.companies.some((c) => productsByCompany.get(c.company_id)?.includes(product))) return false
      if (f.companyId && !p.companies.some((c) => c.company_id === f.companyId)) return false
      if (f.projectId && !p.projects.some((pr) => pr.project_id === f.projectId)) return false
      return true
    }
    const c = row.company
    const cats = c.product_categories.map((x) => x.toLowerCase())
    if (specialty && !cats.includes(specialty)) return false
    if (product && !cats.includes(product)) return false
    if (f.companyId && c.id !== f.companyId) return false
    if (f.projectId && !c.projects.some((pr) => pr.project_id === f.projectId)) return false
    return true
  })
}

export type SortKey = 'name' | 'first_name' | 'last_name' | 'specialty' | 'company' | 'category' | 'projects' | 'status'
export type SortDir = 'asc' | 'desc'

export function sortValue(row: DirectoryRow, key: SortKey): string | number {
  if (row.kind === 'person') {
    const p = row.person
    switch (key) {
      case 'name':
      case 'last_name':
        return `${p.last_name} ${p.first_name}`.toLowerCase()
      case 'first_name':
        return `${p.first_name} ${p.last_name}`.toLowerCase()
      case 'specialty':
        return (p.specialty ?? '\uffff').toLowerCase()
      case 'company':
        return (p.companies[0]?.company_name ?? '\uffff').toLowerCase()
      case 'category':
        return CATEGORY_LABELS[p.categories[0] ?? 'other']
      case 'projects':
        return p.projects.length
      case 'status':
        return p.status
    }
  }
  const c = row.company
  switch (key) {
    case 'name':
    case 'first_name':
    case 'last_name':
    case 'company':
      return c.company_name.toLowerCase()
    case 'specialty':
      return (c.product_categories[0] ?? '\uffff').toLowerCase()
    case 'category':
      return CATEGORY_LABELS[c.categories[0] ?? 'other']
    case 'projects':
      return c.projects.length
    case 'status':
      return c.status
  }
}

export function sortRows(rows: DirectoryRow[], key: SortKey, dir: SortDir): DirectoryRow[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const av = sortValue(a, key)
    const bv = sortValue(b, key)
    const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
    return cmp * sign || sortValue(a, 'name').toString().localeCompare(sortValue(b, 'name').toString())
  })
}

export function buildRows(view: DirectoryView, people: PersonView[], companies: CompanyView[]): DirectoryRow[] {
  const personRows = people.map((person): DirectoryRow => ({ kind: 'person', id: person.id, person }))
  const companyRows = companies.map((company): DirectoryRow => ({ kind: 'company', id: company.id, company }))
  if (view === 'people') return personRows
  if (view === 'companies') return companyRows
  return [...personRows, ...companyRows]
}

export const PAGE_SIZES = [25, 50, 100] as const

export function paginate<T>(rows: T[], page: number, size: number): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(rows.length / size))
  const safe = Math.min(Math.max(1, Math.floor(page) || 1), pages)
  return { items: rows.slice((safe - 1) * size, safe * size), page: safe, pages }
}

// ============ CSV ============

/**
 * Escapes one CSV cell. Values a spreadsheet would evaluate as a formula (leading =, +, -, @, tab, CR) are prefixed
 * with an apostrophe so exported contact data cannot execute in Excel or Sheets.
 */
export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/** RFC 4180 parser: quoted fields, escaped quotes, embedded newlines, CRLF or LF, and a leading BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const src = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
    } else if (ch === '"' && field === '') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

export const IMPORT_FIELDS = [
  { key: 'first_name', label: 'First Name', required: true, aliases: ['first', 'firstname', 'given name'] },
  { key: 'last_name', label: 'Last Name', required: true, aliases: ['last', 'lastname', 'surname', 'family name'] },
  { key: 'email', label: 'Email', required: false, aliases: ['email address', 'e-mail'] },
  { key: 'primary_phone', label: 'Primary Phone', required: false, aliases: ['phone', 'mobile', 'cell', 'phone number'] },
  { key: 'secondary_phone', label: 'Secondary Phone', required: false, aliases: ['office phone', 'work phone', 'alt phone'] },
  { key: 'specialty', label: 'Specialty', required: false, aliases: ['profession', 'trade', 'title'] },
  { key: 'company_name', label: 'Company', required: false, aliases: ['company name', 'organization', 'business'] },
  { key: 'role', label: 'Role at Company', required: false, aliases: ['role', 'position', 'job title'] },
  { key: 'notes', label: 'Notes', required: false, aliases: ['note', 'comments'] },
] as const
export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]['key']
export type ImportMapping = Partial<Record<ImportFieldKey, number>>

export const IMPORT_MAX_ROWS = 1000

export function importTemplateCsv(): string {
  return toCsv(
    IMPORT_FIELDS.map((f) => f.label),
    [['Jordan', 'Lee', 'jordan@example.com', '555-201-3344', '', 'Architect', 'Lee Design Studio', 'Principal', '']],
  )
}

function normHeader(h: string) {
  return h.toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export function guessMapping(headers: string[]): ImportMapping {
  const mapping: ImportMapping = {}
  const used = new Set<number>()
  const normalized = headers.map(normHeader)
  for (const field of IMPORT_FIELDS) {
    const candidates = [normHeader(field.label), normHeader(field.key), ...field.aliases.map(normHeader)]
    const index = normalized.findIndex((h, i) => !used.has(i) && candidates.includes(h))
    if (index >= 0) {
      mapping[field.key] = index
      used.add(index)
    }
  }
  return mapping
}

export type ImportRow = {
  line: number
  values: Record<ImportFieldKey, string>
  errors: string[]
  duplicate: 'file' | 'existing' | null
}

export function applyMapping(rows: string[][], mapping: ImportMapping): ImportRow[] {
  return rows.slice(0, IMPORT_MAX_ROWS).map((cells, i) => {
    const values = {} as Record<ImportFieldKey, string>
    for (const f of IMPORT_FIELDS) {
      const index = mapping[f.key]
      values[f.key] = index === undefined ? '' : (cells[index] ?? '').trim()
    }
    return { line: i + 2, values, errors: [], duplicate: null }
  })
}

/** Validates each mapped row and flags repeated emails inside the file (the first occurrence is kept). */
export function validateImportRows(rows: ImportRow[], existingEmails: Set<string> = new Set()): ImportRow[] {
  const seen = new Set<string>()
  return rows.map((row) => {
    const errors: string[] = []
    const parsed = personSchema.safeParse({ ...row.values, notes: row.values.notes })
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const label = IMPORT_FIELDS.find((f) => f.key === issue.path[0])?.label ?? String(issue.path[0])
        errors.push(`${label}: ${issue.message}`)
      }
    }
    if (row.values.role && !row.values.company_name) errors.push('Role at Company: requires a company')
    if (row.values.company_name.length > 160) errors.push('Company: Must be 160 characters or fewer')
    const email = row.values.email.trim().toLowerCase()
    let duplicate: ImportRow['duplicate'] = null
    if (email) {
      if (existingEmails.has(email)) duplicate = 'existing'
      else if (seen.has(email)) duplicate = 'file'
      seen.add(email)
    }
    return { ...row, errors, duplicate }
  })
}
