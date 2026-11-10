import { COMMUNICATION_LABELS, CONTACT_RELATIONSHIP_LABELS, type ProjectStatus } from './domain.ts'

/** Distinct from the Projects list's `previewProject`, and from each other, so a selection never crosses record types. */
export const CONTACT_PREVIEW_PARAM = 'previewContact'
export const COMPANY_PREVIEW_PARAM = 'previewCompany'
export const CLIENT_PREVIEW_PARAM = 'previewClient'
/** Opens the client edit form over the Clients list. */
export const CLIENT_EDIT_PARAM = 'editClient'
export const CONTACT_PREVIEW_PANEL_ID = 'contact-preview'
export const CLIENT_PREVIEW_PANEL_ID = 'client-preview'
/** Rows shown before "View all" reveals the rest inside the panel. */
export const PREVIEW_LIST_LIMIT = 3

export function personPreviewApiPath(personId: string) {
  return `/api/contacts/people/${encodeURIComponent(personId)}/preview`
}

export function companyPreviewApiPath(companyId: string) {
  return `/api/contacts/companies/${encodeURIComponent(companyId)}/preview`
}

export function clientPreviewApiPath(clientId: string) {
  return `/api/clients/${encodeURIComponent(clientId)}/preview`
}

/** True for any contact or company preview resource, to refresh whichever one is open after a list change. */
export function isContactPreviewKey(key: unknown) {
  return typeof key === 'string' && key.startsWith('/api/contacts/') && key.endsWith('/preview')
}

// ============ People ============

export type PersonPreviewCompany = { id: string; name: string; role: string | null; primary: boolean; href: string }

export type PersonPreviewProject = { id: string; name: string; number: string | null; role: string | null; href: string }

/**
 * Directory contacts never sign in individually. `active` and `revoked` describe a subcontractor portal login that
 * uses this person's email at a company they are affiliated with.
 */
export type PersonAccess =
  | { state: 'error' }
  | {
      state: 'ready'
      status: 'none' | 'active' | 'revoked'
      /** The subcontractor company whose portal access applies, when the person is affiliated with one. */
      company: string | null
      manageHref: string | null
    }

export type PersonPreview = {
  kind: 'person'
  id: string
  status: 'active' | 'inactive'
  specialty: string | null
  email: string | null
  primaryPhone: string | null
  secondaryPhone: string | null
  /** Null when the lookup failed, which is not the same as having none. */
  companies: PersonPreviewCompany[] | null
  projects: PersonPreviewProject[] | null
  access: PersonAccess
  notes: string | null
}

export type LinkedSubcontractor = { subcontractorId: string; companyName: string }
export type SubcontractorAccountRow = { subcontractor_company_id: string; email: string | null; status: string }

/**
 * Portal access for a directory person: a login exists only where one of their subcontractor companies has an
 * account under their email. An active login is reported ahead of a revoked one.
 */
export function pickPersonAccess(
  email: string | null,
  linked: readonly LinkedSubcontractor[],
  accounts: readonly SubcontractorAccountRow[],
): Extract<PersonAccess, { state: 'ready' }> {
  if (!linked.length) return { state: 'ready', status: 'none', company: null, manageHref: null }
  const wanted = email?.trim().toLowerCase()
  const own = wanted ? accounts.filter((a) => a.email?.trim().toLowerCase() === wanted) : []
  const account = own.find((a) => a.status === 'active') ?? own[0]
  const company = (account && linked.find((l) => l.subcontractorId === account.subcontractor_company_id)) || linked[0]
  return {
    state: 'ready',
    status: account ? (account.status === 'active' ? 'active' : 'revoked') : 'none',
    company: company.companyName,
    manageHref: `/subcontractors/${company.subcontractorId}`,
  }
}

// ============ Companies ============

export type CompanyPreviewContact = {
  id: string
  name: string
  role: string | null
  primary: boolean
  email: string | null
  phone: string | null
  href: string
}

export type CompanyPreviewProject = {
  id: string
  name: string
  number: string | null
  href: string
  /** The company itself is assigned (a subcontractor assignment). */
  company: boolean
  /** People assigned individually on this company's behalf. A company assignment never adds anyone here. */
  people: string[]
}

export type CompanyPreview = {
  kind: 'company'
  id: string
  status: 'active' | 'inactive'
  email: string | null
  phone: string | null
  secondaryPhone: string | null
  website: string | null
  address: string | null
  /** Set when a subcontractor record owns this company's name, email, phone, and status. */
  subcontractor: { href: string | null; trade: string | null } | null
  categories: string[]
  productCategories: string[]
  contacts: CompanyPreviewContact[] | null
  projects: CompanyPreviewProject[] | null
  notes: string | null
}

type ProjectRef = { id: string; name: string; number: string | null }

/** One row per project, keeping apart how it is linked: the company's own assignment, and each individually assigned person. */
export function mergeCompanyProjects(
  companyAssigned: readonly ProjectRef[],
  viaPeople: readonly (ProjectRef & { person: string; role: string | null })[],
): CompanyPreviewProject[] {
  const byId = new Map<string, CompanyPreviewProject>()
  const entry = (p: ProjectRef) => {
    let row = byId.get(p.id)
    if (!row) {
      row = { id: p.id, name: p.name, number: p.number, href: `/projects/${p.id}`, company: false, people: [] }
      byId.set(p.id, row)
    }
    return row
  }
  for (const p of companyAssigned) entry(p).company = true
  for (const p of viaPeople) {
    const label = p.role?.trim() ? `${p.person} (${p.role.trim()})` : p.person
    const row = entry(p)
    if (!row.people.includes(label)) row.people.push(label)
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

export function companyProjectDetail(project: Pick<CompanyPreviewProject, 'company' | 'people'>): string {
  const parts = [
    project.company ? 'Company assigned' : null,
    project.people.length ? `${project.people.join(', ')} assigned individually` : null,
  ].filter(Boolean)
  return parts.join(' · ')
}

// ============ Clients ============

export type ClientPreviewContact = {
  name: string
  /** Only what is stored; never inferred from the contact's position on the record. */
  relationship: string | null
  preference: string | null
  email: string | null
  phone: string | null
}

export type ClientPreviewProject = { id: string; name: string; number: string | null; status: ProjectStatus; href: string }

export type ClientPortalStatus = 'not_provisioned' | 'invited' | 'pending' | 'active' | 'suspended' | 'portal_off'

export const CLIENT_PORTAL_LABELS: Record<ClientPortalStatus, string> = {
  not_provisioned: 'Not provisioned',
  invited: 'Invited',
  pending: 'Activation pending',
  active: 'Active',
  suspended: 'Suspended',
  portal_off: 'Portal turned off',
}

export type ClientPortal =
  /** `hidden`: this viewer's role does not manage portal access, so the section is not shown. */
  | { state: 'hidden' | 'error' }
  | { state: 'ready'; status: ClientPortalStatus; detail: string | null; manageHref: string }

export type ClientPreview = {
  id: string
  contacts:
    | { state: 'error' }
    | { state: 'ready'; primary: ClientPreviewContact; secondary: ClientPreviewContact | null; otherCount: number }
  projects: { state: 'error' } | { state: 'ready'; items: ClientPreviewProject[] }
  portal: ClientPortal
  notes: string | null
  contactsHref: string
  /** Null unless this viewer may create projects. The client is carried explicitly in the link. */
  createProjectHref: string | null
}

export function contactPreference(method: string | null | undefined): string | null {
  if (!method) return null
  const label = (COMMUNICATION_LABELS as Record<string, string>)[method]
  if (!label) return null
  return method === 'any' ? label : `Prefers ${label.toLowerCase()}`
}

export type ClientRecordContact = {
  first_name: string
  middle_name?: string | null
  last_name: string
  email: string | null
  phone: string | null
  preferred_communication?: string | null
}

export type ClientContactRow = ClientRecordContact & { id: string; relationship: string | null; is_primary: boolean }

const joinName = (c: ClientRecordContact) => [c.first_name, c.middle_name, c.last_name].filter((part) => part?.trim()).join(' ')

/** "Other" is the form's default, so it says nothing about how the contact relates to the client. */
function storedRelationship(relationship: string | null | undefined): string | null {
  if (!relationship || relationship === 'other') return null
  return CONTACT_RELATIONSHIP_LABELS[relationship] ?? null
}

/**
 * The primary contact is the row flagged primary, or the client record itself when no contact row carries the flag.
 * The secondary contact is the first other active contact; the rest are counted, not shown.
 */
export function pickClientContacts(
  client: ClientRecordContact,
  contacts: readonly ClientContactRow[],
): { primary: ClientPreviewContact; secondary: ClientPreviewContact | null; otherCount: number } {
  const toContact = (c: ClientRecordContact, relationship: string | null): ClientPreviewContact => ({
    name: joinName(c),
    relationship,
    preference: contactPreference(c.preferred_communication),
    email: c.email?.trim() || null,
    phone: c.phone?.trim() || null,
  })
  const primaryRow = contacts.find((c) => c.is_primary)
  const others = contacts.filter((c) => c !== primaryRow)
  return {
    primary: primaryRow ? toContact(primaryRow, storedRelationship(primaryRow.relationship)) : toContact(client, null),
    secondary: others[0] ? toContact(others[0], storedRelationship(others[0].relationship)) : null,
    otherCount: Math.max(0, others.length - 1),
  }
}

export type PortalAccountState = { status: string | null; activationRequired: boolean }

const loginCount = (count: number) => `${count} ${count === 1 ? 'login' : 'logins'}`

/**
 * One status for a client's portal logins. A usable login outranks one waiting for first sign-in, which outranks
 * suspended ones, so the summary never understates access that exists.
 */
export function summarizePortalAccounts(accounts: readonly PortalAccountState[]): { status: ClientPortalStatus; detail: string | null } | null {
  if (!accounts.length) return null
  const live = accounts.filter((a) => a.status === 'active')
  const active = live.filter((a) => !a.activationRequired).length
  const pending = live.length - active
  const suspended = accounts.length - live.length
  const extras = [pending && active ? `${pending} awaiting first sign-in` : null, suspended && live.length ? `${suspended} suspended` : null].filter(Boolean)
  if (active) return { status: 'active', detail: [`${loginCount(active)} active`, ...extras].join(' · ') }
  if (pending) return { status: 'pending', detail: [`${loginCount(pending)} awaiting first sign-in`, ...extras].join(' · ') }
  return { status: 'suspended', detail: `${loginCount(suspended)} suspended` }
}

// ============ Failures ============

const NOUN = { contact: 'contact', company: 'company', client: 'client' } as const

/** What a preview says for a failed request, and whether trying again can help. */
export function recordPreviewErrorState(status: number | null, kind: keyof typeof NOUN): { message: string; retry: boolean } {
  const noun = NOUN[kind]
  if (status === 401) return { message: `Your session has ended. Sign in again to see this ${noun}.`, retry: false }
  if (status === 403) return { message: `You do not have access to this ${noun}.`, retry: false }
  if (status === 404) return { message: `This ${noun} is no longer available.`, retry: false }
  return { message: `${noun.charAt(0).toUpperCase()}${noun.slice(1)} details could not be loaded.`, retry: true }
}
