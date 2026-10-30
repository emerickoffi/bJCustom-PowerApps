import { personSchema, SUBCONTRACTOR_CONTACT_ROLES, type PersonInput } from './contacts.ts'
import { isUuid } from './subcontractor-projects.ts'

/** Hidden form field carrying the Contact Persons section as JSON. */
export const CONTACT_PERSONS_FIELD = 'contact_persons'
export const MAX_CONTACT_PERSONS = 20

export type ContactRole = (typeof SUBCONTRACTOR_CONTACT_ROLES)[number]

/** A person from the Contacts directory, with their current company relationships to help pick the right one. */
export type ContactPersonOption = {
  id: string
  first_name: string
  last_name: string
  email: string | null
  primary_phone: string | null
  secondary_phone: string | null
  companies: { name: string; role: string | null }[]
}

/** An active relationship already saved for the company being edited. */
export type CurrentContactPerson = {
  relationship_id: string
  person: ContactPersonOption
  role: string | null
  is_primary: boolean
}

export type NewPersonFields = {
  first_name: string
  last_name: string
  email: string
  primary_phone: string
  secondary_phone: string
}

/** One card in the Contact Persons section, as serialized by the form. */
export type ContactPersonDraft =
  | { key: string; kind: 'existing'; person_id: string; role: string; is_primary: boolean }
  | ({ key: string; kind: 'new'; role: string; is_primary: boolean } & NewPersonFields)
  | { key: string; kind: 'current'; relationship_id: string; person_id: string; role: string; is_primary: boolean; remove: boolean }

export type ParsedContactPerson =
  | { kind: 'existing'; person_id: string; role: string | null; is_primary: boolean }
  | { kind: 'new'; key: string; person: PersonInput; role: string | null; is_primary: boolean }
  | { kind: 'current'; relationship_id: string; person_id: string; role: string | null; is_primary: boolean; remove: boolean }

export type ParseContactPersonsResult =
  | { ok: true; items: ParsedContactPerson[] }
  | { ok: false; error: string; fieldErrors: Record<string, string> }

const KEY_RE = /^[a-z0-9-]{1,40}$/i
const str = (v: unknown) => (typeof v === 'string' ? v : '')

export const contactFieldKey = (key: string, field: string) => `${CONTACT_PERSONS_FIELD}.${key}.${field}`

/**
 * Validates the serialized Contact Persons section. New-person fields reuse the Contacts directory rules, roles come
 * from the subcontractor role list (an existing custom role is kept as-is), and at most one person can be primary.
 */
export function parseContactPersons(raw: string | null | undefined): ParseContactPersonsResult {
  const fail = (error: string, fieldErrors: Record<string, string> = {}): ParseContactPersonsResult => ({
    ok: false,
    error,
    fieldErrors: { [CONTACT_PERSONS_FIELD]: error, ...fieldErrors },
  })
  if (!raw || !raw.trim()) return { ok: true, items: [] }
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return fail('The contact persons could not be read. Refresh the page and try again.')
  }
  if (!Array.isArray(data)) return fail('The contact persons could not be read. Refresh the page and try again.')
  if (data.length > MAX_CONTACT_PERSONS) return fail(`Add ${MAX_CONTACT_PERSONS} contact persons or fewer.`)

  const items: ParsedContactPerson[] = []
  const fieldErrors: Record<string, string> = {}
  const seenPeople = new Set<string>()
  const seenEmails = new Set<string>()
  const seenKeys = new Set<string>()
  let primaries = 0

  for (const entry of data as Record<string, unknown>[]) {
    const key = str(entry?.key)
    if (!KEY_RE.test(key) || seenKeys.has(key)) return fail('The contact persons could not be read. Refresh the page and try again.')
    seenKeys.add(key)
    const kind = entry.kind
    const roleRaw = str(entry.role).trim()
    const isPrimary = entry.is_primary === true

    if (kind === 'current') {
      const relationshipId = str(entry.relationship_id)
      const personId = str(entry.person_id)
      if (!isUuid(relationshipId) || !isUuid(personId)) return fail('The contact persons could not be read. Refresh the page and try again.')
      const remove = entry.remove === true
      if (roleRaw.length > 120) fieldErrors[contactFieldKey(key, 'role')] = 'Must be 120 characters or fewer'
      if (!remove) seenPeople.add(personId)
      if (!remove && isPrimary) primaries++
      items.push({ kind, relationship_id: relationshipId, person_id: personId, role: roleRaw || null, is_primary: !remove && isPrimary, remove })
      continue
    }

    if (roleRaw && !(SUBCONTRACTOR_CONTACT_ROLES as readonly string[]).includes(roleRaw)) {
      fieldErrors[contactFieldKey(key, 'role')] = 'Choose a role from the list'
    }
    if (isPrimary) primaries++

    if (kind === 'existing') {
      const personId = str(entry.person_id)
      if (!isUuid(personId)) {
        fieldErrors[contactFieldKey(key, 'person_id')] = 'Choose a contact'
        continue
      }
      if (seenPeople.has(personId)) fieldErrors[contactFieldKey(key, 'person_id')] = 'This person is already listed'
      seenPeople.add(personId)
      items.push({ kind, person_id: personId, role: roleRaw || null, is_primary: isPrimary })
      continue
    }

    if (kind === 'new') {
      const parsed = personSchema.safeParse({
        first_name: str(entry.first_name),
        last_name: str(entry.last_name),
        email: str(entry.email),
        primary_phone: str(entry.primary_phone),
        secondary_phone: str(entry.secondary_phone),
      })
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const field = contactFieldKey(key, issue.path.join('.'))
          if (!fieldErrors[field]) fieldErrors[field] = issue.message
        }
        continue
      }
      const email = parsed.data.email
      if (email) {
        if (seenEmails.has(email)) fieldErrors[contactFieldKey(key, 'email')] = 'Another new contact above uses this email'
        seenEmails.add(email)
      }
      items.push({ kind, key, person: parsed.data, role: roleRaw || null, is_primary: isPrimary })
      continue
    }

    return fail('The contact persons could not be read. Refresh the page and try again.')
  }

  if (primaries > 1) return fail('Choose only one primary contact.', fieldErrors)
  if (Object.keys(fieldErrors).length) {
    return { ok: false, error: 'Please correct the highlighted contact persons.', fieldErrors }
  }
  return { ok: true, items }
}

const digits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '')

/** Matches first, last, or full name, email, and either phone number (punctuation-insensitive). */
export function matchesContactSearch(person: ContactPersonOption, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const full = `${person.first_name} ${person.last_name}`.toLowerCase()
  const reversed = `${person.last_name} ${person.first_name}`.toLowerCase()
  if (full.includes(q) || reversed.includes(q) || (person.email ?? '').toLowerCase().includes(q)) return true
  const qDigits = digits(q)
  return qDigits.length >= 3 && [person.primary_phone, person.secondary_phone].some((p) => digits(p).includes(qDigits))
}

/** Existing people who may be the same person as a new entry: same email, either phone, or exact full name. */
export function findPossibleExistingPeople(input: NewPersonFields, people: ContactPersonOption[]): ContactPersonOption[] {
  const email = input.email.trim().toLowerCase()
  const phones = [input.primary_phone, input.secondary_phone].map(digits).filter((d) => d.length >= 7)
  const name = `${input.first_name} ${input.last_name}`.trim().toLowerCase().replace(/\s+/g, ' ')
  return people.filter((p) => {
    if (email && p.email?.toLowerCase() === email) return true
    const theirs = [p.primary_phone, p.secondary_phone].map(digits).filter((d) => d.length >= 7)
    if (phones.some((d) => theirs.includes(d))) return true
    return Boolean(input.first_name.trim() && input.last_name.trim()) && `${p.first_name} ${p.last_name}`.toLowerCase() === name
  })
}

/**
 * Orders the relationship writes so the one-primary-per-company index is never violated mid-save: clear the old
 * primary before any new one is set.
 */
export function planCurrentContactChanges(
  current: { relationship_id: string; role: string | null; is_primary: boolean }[],
  submitted: Extract<ParsedContactPerson, { kind: 'current' }>[],
) {
  const byId = new Map(current.map((c) => [c.relationship_id, c]))
  const end: string[] = []
  const update: { relationship_id: string; role: string | null; is_primary: boolean }[] = []
  for (const s of submitted) {
    const saved = byId.get(s.relationship_id)
    if (!saved) continue
    if (s.remove) end.push(s.relationship_id)
    else if (saved.role !== s.role || saved.is_primary !== s.is_primary) update.push({ relationship_id: s.relationship_id, role: s.role, is_primary: s.is_primary })
  }
  update.sort((a, b) => Number(a.is_primary) - Number(b.is_primary))
  return { end, update }
}
