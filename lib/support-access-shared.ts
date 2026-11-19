// Pure helpers for support access. No server imports, so node --test can load this file directly.

/** Windows a company admin can choose. The database accepts exactly these. */
export const SUPPORT_DURATIONS = [
  { minutes: 30, label: '30 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 120, label: '2 hours' },
  { minutes: 240, label: '4 hours' },
] as const

export type SupportDurationMinutes = (typeof SUPPORT_DURATIONS)[number]['minutes']
export const DEFAULT_SUPPORT_MINUTES: SupportDurationMinutes = 60

export function isSupportDuration(value: number): value is SupportDurationMinutes {
  return SUPPORT_DURATIONS.some((d) => d.minutes === value)
}

/** Sections support can open, in display order. Must match platform_support_view(). */
export const SUPPORT_SECTIONS = [
  { key: 'overview', label: 'Overview' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'daily_logs', label: 'Daily logs' },
  { key: 'issues', label: 'Issues' },
  { key: 'rfis', label: 'RFIs' },
  { key: 'change_orders', label: 'Change orders' },
  { key: 'selections', label: 'Selections' },
  { key: 'estimates', label: 'Estimates' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'documents', label: 'Documents' },
  { key: 'photos', label: 'Photos' },
] as const

export type SupportSection = (typeof SUPPORT_SECTIONS)[number]['key']

export function parseSupportSection(value: string | null | undefined): SupportSection {
  return SUPPORT_SECTIONS.find((s) => s.key === value)?.key ?? 'overview'
}

export function supportSectionLabel(key: string | null | undefined): string {
  return SUPPORT_SECTIONS.find((s) => s.key === key)?.label ?? 'Project'
}

export type SupportGrant = {
  id: string
  project_id: string
  project_name: string
  project_number: string | null
  ticket_reference: string
  reason: string | null
  access_level: 'read_only'
  granted_at: string
  expires_at: string
  revoked_at: string | null
  granted_by_name: string | null
}

export type SupportEvent = {
  id: string
  grant_id: string | null
  actor_kind: 'company' | 'support'
  actor_name: string | null
  actor_email: string | null
  action: 'granted' | 'revoked' | 'viewed'
  section: string | null
  created_at: string
}

export type SupportGrantState = 'active' | 'expired' | 'revoked'

export function grantState(grant: Pick<SupportGrant, 'expires_at' | 'revoked_at'>, now: Date = new Date()): SupportGrantState {
  if (grant.revoked_at) return 'revoked'
  return new Date(grant.expires_at).getTime() > now.getTime() ? 'active' : 'expired'
}

/** "42 min left", "1 hr 5 min left", "Ended". Rounds up so a live grant never reads "0 min". */
export function timeLeftLabel(expiresAt: string, now: Date = new Date()): string {
  const ms = new Date(expiresAt).getTime() - now.getTime()
  if (!(ms > 0)) return 'Ended'
  const total = Math.ceil(ms / 60_000)
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  if (hours === 0) return `${minutes} min left`
  return minutes === 0 ? `${hours} hr left` : `${hours} hr ${minutes} min left`
}

/** One plain sentence per log entry, for the company admin's access log. */
export function describeSupportEvent(event: SupportEvent): string {
  const who = event.actor_name || event.actor_email || (event.actor_kind === 'support' ? 'Trefort support' : 'A company admin')
  switch (event.action) {
    case 'granted':
      return `${who} granted support access`
    case 'revoked':
      return `${who} revoked support access`
    case 'viewed':
      return `${who} (Trefort support) viewed ${supportSectionLabel(event.section)}`
    default:
      return who
  }
}

/** Database messages from the support functions are written for people; strip the Postgres prefix. */
export function supportDbMessage(message: string | undefined | null): string {
  if (!message) return 'Something went wrong. Try again.'
  return message.replace(/^.*?ERROR:\s*/i, '').trim().replace(/([^.!?])$/, '$1.')
}
