// Pure helpers for the Trefort owner console. No server imports, so node --test can load this file directly.
import { FEATURES, isSwitchable, resolveFeatures, type FeatureDefinition, type FeatureKey, type FeatureMap } from './feature-registry.ts'

export type PlatformOverview = {
  companies: number
  active_companies: number
  suspended_companies: number
  new_companies_30d: number
  staff_members: number
  homeowners: number
  projects: number
  companies_by_plan?: Record<string, number>
}

export type PlatformPlan = {
  key: string
  name: string
  tagline: string | null
  sort_order: number
  all_features: boolean
  features: string[]
  max_staff: number | null
  custom_domain: boolean
  white_label: boolean
  monthly_price_cents: number | null
  is_public: boolean
  companies: number
}

export type PlatformCompanyRow = {
  id: string
  display_name: string
  legal_name: string | null
  subscription_status: string
  /** Missing until the subscription plans migration is applied. */
  plan_key?: string
  plan_name?: string
  created_at: string
  suspended_at: string | null
  staff_count: number
  homeowner_count: number
  project_count: number
  last_activity_at: string | null
  admin_emails: string[]
}

export type PlatformMember = {
  user_id: string
  full_name: string | null
  email: string
  role: 'org_admin' | 'project_manager' | 'builder_staff' | 'client'
  status: string
  activation_required: boolean
  joined_at: string
  last_sign_in_at: string | null
}

export type PlatformEvent = {
  action: string
  details: Record<string, unknown>
  created_at: string
  actor_email: string | null
  organization_id?: string | null
  organization_name?: string | null
}

export type PlatformCompanyDetail = {
  id: string
  display_name: string
  legal_name: string | null
  email: string | null
  phone: string | null
  website: string | null
  city: string | null
  state: string | null
  subscription_status: string
  plan_key?: string
  plan_name?: string
  plan_max_staff?: number | null
  created_at: string
  suspended_at: string | null
  suspended_reason: string | null
  suspended_by_email: string | null
  project_number_prefix: string | null
  timezone: string | null
  counts: {
    projects: number
    clients: number
    estimates: number
    invoices: number
    staff_seats?: number
    pending_staff_invites?: number
  }
  last_activity_at: string | null
  members: PlatformMember[]
  feature_overrides: Partial<Record<FeatureKey, boolean>>
  events: PlatformEvent[]
}

export type PlatformUser = {
  user_id: string
  email: string
  full_name: string | null
  created_at: string
  last_sign_in_at: string | null
  blocked: boolean
  platform_admin: boolean
  memberships: { organization_id: string; organization_name: string; role: PlatformMember['role']; status: string }[]
}

const SUBSCRIPTION_LABELS: Record<string, string> = {
  internal: 'Internal',
  trialing: 'Trial',
  active: 'Active',
  past_due: 'Past due',
  canceled: 'Canceled',
  unpaid: 'Unpaid',
}

/** Billing state shown in the console. Suspension always wins, because it is what members actually experience. */
export function companyStatus(row: { suspended_at: string | null; subscription_status: string }): {
  label: string
  tone: 'danger' | 'warning' | 'primary' | 'neutral' | 'info'
} {
  if (row.suspended_at) return { label: 'Suspended', tone: 'danger' }
  const label = SUBSCRIPTION_LABELS[row.subscription_status] ?? row.subscription_status
  if (row.subscription_status === 'past_due' || row.subscription_status === 'unpaid') return { label, tone: 'warning' }
  if (row.subscription_status === 'active') return { label, tone: 'primary' }
  if (row.subscription_status === 'trialing') return { label, tone: 'info' }
  return { label, tone: 'neutral' }
}

/** Case-insensitive match on company name, legal name or an admin's email. */
export function filterCompanies(rows: PlatformCompanyRow[], query: string | null | undefined): PlatformCompanyRow[] {
  const q = (query ?? '').trim().toLowerCase()
  if (!q) return rows
  return rows.filter(
    (r) =>
      r.display_name.toLowerCase().includes(q) ||
      (r.legal_name ?? '').toLowerCase().includes(q) ||
      r.admin_emails.some((e) => e.toLowerCase().includes(q)),
  )
}

export type CompanyFeatureRow = {
  feature: FeatureDefinition
  /** What the company's members actually get, after dependencies. */
  effective: boolean
  /** The company's own switch (or the default when never changed). */
  switchedOn: boolean
  /** Turned on but blocked by a module it depends on. */
  blockedBy: FeatureKey[]
  /** The company's plan does not include this module, so it stays off whatever the switch says. */
  notInPlan: boolean
}

/** Every module an owner can switch for a company, in registry order, with its effective state. */
export function companyFeatureRows(
  overrides: Partial<Record<FeatureKey, boolean>>,
  plan?: Pick<PlatformPlan, 'all_features' | 'features'> | null,
): CompanyFeatureRow[] {
  const switchable = FEATURES.filter(isSwitchable)
  const inPlan = (key: FeatureKey) => !plan || plan.all_features || plan.features.includes(key)
  const masked: Partial<Record<FeatureKey, boolean>> = { ...overrides }
  for (const f of switchable) if (!inPlan(f.key)) masked[f.key] = false
  const effective: FeatureMap = resolveFeatures(masked)
  return switchable.map((feature) => {
    const notInPlan = !inPlan(feature.key)
    const switchedOn = notInPlan ? false : (overrides[feature.key] ?? feature.defaultEnabled)
    const blockedBy = switchedOn ? feature.requires.filter((r) => !effective[r]) : []
    return { feature, effective: effective[feature.key], switchedOn, blockedBy, notInPlan }
  })
}

/** Plan name for a key, falling back to a readable version of the key. */
export function planName(plans: Pick<PlatformPlan, 'key' | 'name'>[], key: string | null | undefined): string {
  if (!key) return 'Unknown'
  return plans.find((p) => p.key === key)?.name ?? key.charAt(0).toUpperCase() + key.slice(1).replaceAll('_', ' ')
}

const EVENT_LABELS: Record<string, string> = {
  feature_enabled: 'Turned on',
  feature_disabled: 'Turned off',
  company_suspended: 'Suspended the company',
  company_reactivated: 'Reactivated the company',
  plan_changed: 'Changed plan',
  discount_applied: 'Applied discount',
  discount_removed: 'Removed the discount',
}

/** One readable line for an owner action, e.g. "Turned on Daily logs". */
export function describeEvent(event: Pick<PlatformEvent, 'action' | 'details'>): string {
  const base = EVENT_LABELS[event.action] ?? event.action.replaceAll('_', ' ')
  if (event.action === 'plan_changed') {
    const from = typeof event.details?.from === 'string' ? planName([], event.details.from) : null
    const to = typeof event.details?.to === 'string' ? planName([], event.details.to) : null
    const note = typeof event.details?.note === 'string' ? event.details.note : null
    return `${base}${from && to ? ` from ${from} to ${to}` : ''}${note ? `: ${note}` : ''}`
  }
  if (event.action === 'discount_applied' && typeof event.details?.discount === 'string') return `${base}: ${event.details.discount}`
  const feature = typeof event.details?.feature === 'string' ? event.details.feature : null
  if (feature) {
    const label = FEATURES.find((f) => f.key === feature)?.label ?? feature
    return `${base} ${label}`
  }
  const reason = typeof event.details?.reason === 'string' ? event.details.reason : null
  return reason ? `${base}: ${reason}` : base
}
