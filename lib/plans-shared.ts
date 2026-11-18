/** Subscription plan helpers shared by server and client code. The database is the source of truth. */

export type PlanSummary = {
  plan_key: string
  plan_name: string
  tagline: string | null
  is_public: boolean
  all_features: boolean
  features: string[]
  max_staff: number | null
  custom_domain: boolean
  white_label: boolean
  staff_seats: number
  pending_staff_invites: number
  /** Cheapest public plan that includes each module, for "Upgrade to …" messages. */
  upgrade_plans: Record<string, string | null>
}

export type PlanAccess = { all_features: boolean; features: string[] }

/** Whether the plan includes a switchable module. Keys outside the database registry are never limited. */
export function planAllows(plan: PlanAccess | null | undefined, key: string, registryKeys: readonly string[]): boolean {
  if (!plan) return true
  if (!registryKeys.includes(key)) return true
  return plan.all_features || plan.features.includes(key)
}

/** Forces modules outside the plan off, so dependent and bundled modules follow, exactly as the database does. */
export function applyPlanToOverrides<K extends string>(
  overrides: Partial<Record<K, boolean>>,
  plan: PlanAccess | null | undefined,
  registryKeys: readonly K[],
): Partial<Record<K, boolean>> {
  if (!plan || plan.all_features) return overrides
  const next = { ...overrides }
  for (const key of registryKeys) if (!plan.features.includes(key)) next[key] = false
  return next
}

export type SeatUsage = { used: number; pending: number; max: number | null; full: boolean; label: string }

export function seatUsage(plan: Pick<PlanSummary, 'staff_seats' | 'pending_staff_invites' | 'max_staff'>): SeatUsage {
  const used = plan.staff_seats
  const pending = plan.pending_staff_invites
  const max = plan.max_staff
  const full = max !== null && used + pending >= max
  const seats = max === null ? `${used} team member${used === 1 ? '' : 's'} (unlimited)` : `${used} of ${max} team seats used`
  const label = pending > 0 ? `${seats}, ${pending} invitation${pending === 1 ? '' : 's'} pending` : seats
  return { used, pending, max, full, label }
}

export function upgradeMessage(plan: Pick<PlanSummary, 'upgrade_plans'>, key: string): string {
  const target = plan.upgrade_plans[key]
  return target ? `Included in the ${target} plan. Upgrade from Plan & billing.` : 'Not included in your plan.'
}
