import { CONTACT_RELATIONSHIP_LABELS } from './domain.ts'

/** Relationships offered when adding a new additional homeowner contact. Professionals belong in Business Contacts. */
export const ADDITIONAL_CONTACT_RELATIONSHIPS = [
  'spouse',
  'partner',
  'co_owner',
  'trustee',
  'authorized_representative',
  'family',
  'other',
] as const

export type AdditionalContactRelationship = (typeof ADDITIONAL_CONTACT_RELATIONSHIPS)[number]

export function additionalContactRelationshipOptions(): { value: string; label: string }[] {
  return ADDITIONAL_CONTACT_RELATIONSHIPS.map((value) => ({ value, label: CONTACT_RELATIONSHIP_LABELS[value] }))
}

export function isAdditionalContactRelationship(value: string): value is AdditionalContactRelationship {
  return (ADDITIONAL_CONTACT_RELATIONSHIPS as readonly string[]).includes(value)
}

/** No scoping rows means the contact applies to every project of the client (pre-existing behavior). */
export function isContactVisibleOnProject(scopedProjectIds: readonly string[], projectId: string): boolean {
  return scopedProjectIds.length === 0 || scopedProjectIds.includes(projectId)
}

export type DuplicateCandidate = {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  alternate_phone: string | null
}

export type DuplicateReason = 'email' | 'phone' | 'name'

const digits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
const norm = (v: string | null | undefined) => (v ?? '').trim().toLowerCase()

/**
 * Lists existing contacts that may be the same person. Never used to merge automatically;
 * a name-only match is reported so staff can decide, but it never blocks on its own.
 */
export function findPossibleDuplicates<T extends DuplicateCandidate>(
  input: Omit<DuplicateCandidate, 'id'>,
  existing: readonly T[],
): { contact: T; reasons: DuplicateReason[] }[] {
  const email = norm(input.email)
  const phones = [digits(input.phone), digits(input.alternate_phone)].filter((p) => p.length >= 7)
  const name = `${norm(input.first_name)} ${norm(input.last_name)}`
  const matches: { contact: T; reasons: DuplicateReason[] }[] = []
  for (const c of existing) {
    const reasons: DuplicateReason[] = []
    if (email && norm(c.email) === email) reasons.push('email')
    const theirPhones = [digits(c.phone), digits(c.alternate_phone)].filter((p) => p.length >= 7)
    if (phones.some((p) => theirPhones.includes(p))) reasons.push('phone')
    if (name.trim() && `${norm(c.first_name)} ${norm(c.last_name)}` === name) reasons.push('name')
    if (reasons.length) matches.push({ contact: c, reasons })
  }
  return matches
}

export type HomeownerPortalStatus = 'not_provisioned' | 'active' | 'pending' | 'suspended' | 'no_project_access'

export const HOMEOWNER_PORTAL_STATUS: Record<HomeownerPortalStatus, { label: string; tone: 'sage' | 'warning' | 'neutral' | 'danger' }> = {
  not_provisioned: { label: 'Not provisioned', tone: 'neutral' },
  active: { label: 'Portal active', tone: 'sage' },
  pending: { label: 'Activation pending', tone: 'warning' },
  suspended: { label: 'Portal suspended', tone: 'danger' },
  no_project_access: { label: 'No access to this project', tone: 'neutral' },
}

export function derivePortalStatus(
  account: { projectIds: readonly string[] } | null | undefined,
  member: { status: string; activation_required: boolean } | null | undefined,
  projectId: string,
): HomeownerPortalStatus {
  if (!account) return 'not_provisioned'
  if (member?.status === 'suspended') return 'suspended'
  if (!account.projectIds.includes(projectId)) return 'no_project_access'
  if (member?.activation_required) return 'pending'
  return member?.status === 'active' ? 'active' : 'pending'
}
