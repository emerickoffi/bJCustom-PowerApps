/** Billing rules shared by server and client code. Stripe is the source of truth; the webhook copies its state. */

export type BillingInterval = 'month' | 'year'

export type OrgBilling = {
  plan_key: string
  subscription_status: string
  trial_ends_at: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  billing_interval: BillingInterval | null
  has_subscription: boolean
}

export type PlanPrice = {
  key: string
  name: string
  tagline: string | null
  sort_order: number
  max_staff: number | null
  monthly_price_cents: number | null
  yearly_price_cents: number | null
  is_public: boolean
}

/**
 * ok: full access. warning: access continues but an admin should act (payment failed, trial ending soon).
 * blocked: the staff app is paused until an administrator picks a plan or fixes payment. Data is never deleted.
 */
export type BillingAccess = { state: 'ok' | 'warning' | 'blocked'; reason: string | null }

const DAY = 86_400_000

export function trialDaysLeft(trialEndsAt: string | null, now = Date.now()): number | null {
  if (!trialEndsAt) return null
  return Math.max(0, Math.ceil((Date.parse(trialEndsAt) - now) / DAY))
}

export function billingAccess(b: Pick<OrgBilling, 'subscription_status' | 'trial_ends_at'>, now = Date.now()): BillingAccess {
  switch (b.subscription_status) {
    case 'internal':
    case 'active':
      return { state: 'ok', reason: null }
    case 'trialing': {
      const left = trialDaysLeft(b.trial_ends_at, now)
      if (left === null) return { state: 'ok', reason: null }
      if (Date.parse(b.trial_ends_at!) <= now) return { state: 'blocked', reason: 'Your free trial has ended. Choose a plan to keep working.' }
      if (left <= 3) return { state: 'warning', reason: `Your free trial ends in ${left} day${left === 1 ? '' : 's'}. Choose a plan to keep access.` }
      return { state: 'ok', reason: null }
    }
    case 'past_due':
      return { state: 'warning', reason: 'Your last payment failed. Update your card to avoid losing access.' }
    case 'incomplete':
      return { state: 'warning', reason: 'Your first payment has not gone through yet.' }
    case 'unpaid':
    case 'incomplete_expired':
      return { state: 'blocked', reason: 'Payment is overdue. Update your card or choose a plan to keep working.' }
    case 'canceled':
      return { state: 'blocked', reason: 'Your subscription has ended. Choose a plan to keep working.' }
    case 'paused':
      return { state: 'blocked', reason: 'Your subscription is paused. Choose a plan to keep working.' }
    default:
      return { state: 'ok', reason: null }
  }
}

export function formatPlanPrice(cents: number | null, interval: BillingInterval): string {
  if (cents === null) return 'Contact us'
  const dollars = cents / 100
  const amount = Number.isInteger(dollars) ? `$${dollars.toLocaleString('en-US')}` : `$${dollars.toFixed(2)}`
  return `${amount}/${interval === 'month' ? 'mo' : 'yr'}`
}

/**
 * How a plan price is shown on the billing page. Yearly plans are quoted per month, the way the website quotes
 * them ("$179/mo, billed annually"), with the yearly total and the saving against paying monthly.
 */
export function describePlanPrice(
  plan: Pick<PlanPrice, 'monthly_price_cents' | 'yearly_price_cents'>,
  interval: BillingInterval,
): { headline: string; note: string | null } {
  if (interval === 'month') {
    return { headline: formatPlanPrice(plan.monthly_price_cents, 'month'), note: plan.monthly_price_cents === null ? null : 'Billed monthly' }
  }
  const yearly = plan.yearly_price_cents
  if (yearly === null) return { headline: formatPlanPrice(null, 'year'), note: null }
  const perMonth = Math.round(yearly / 12)
  const saving = plan.monthly_price_cents === null ? 0 : plan.monthly_price_cents * 12 - yearly
  const total = formatPlanPrice(yearly, 'year')
  return {
    headline: formatPlanPrice(perMonth, 'month'),
    note: saving > 0 ? `Billed annually (${total}), save ${formatPlanPrice(saving, 'year').replace('/yr', '')}` : `Billed annually (${total})`,
  }
}

/** The largest yearly saving across plans, as a whole percent, for the billing toggle ("save up to 12%"). */
export function maxYearlySavingPercent(plans: Pick<PlanPrice, 'monthly_price_cents' | 'yearly_price_cents'>[]): number {
  let best = 0
  for (const p of plans) {
    if (p.monthly_price_cents && p.yearly_price_cents) {
      best = Math.max(best, Math.floor((1 - p.yearly_price_cents / (p.monthly_price_cents * 12)) * 100))
    }
  }
  return best
}

/** Stripe price lookup keys, one per plan and interval, e.g. trefort_pro_month. */
export function priceLookupKey(planKey: string, interval: BillingInterval): string {
  return `trefort_${planKey}_${interval}`
}

export function parsePriceLookupKey(key: string | null | undefined): { planKey: string; interval: BillingInterval } | null {
  const m = /^trefort_([a-z][a-z0-9_]*?)_(month|year)$/.exec(key ?? '')
  return m ? { planKey: m[1], interval: m[2] as BillingInterval } : null
}

/** Stripe statuses we store as-is; anything unknown is stored as incomplete so access stays limited. */
export function normalizeStripeStatus(status: string): string {
  return ['trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'].includes(status)
    ? status
    : 'incomplete'
}
