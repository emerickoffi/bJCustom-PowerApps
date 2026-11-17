import 'server-only'
import Stripe from 'stripe'
import { priceLookupKey, type BillingInterval, type PlanPrice } from '@/lib/billing-shared'

let client: Stripe | null = null

/** Null until STRIPE_SECRET_KEY is set, so the rest of the app keeps working without billing. */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  client ??= new Stripe(key, { appInfo: { name: 'Trefort' } })
  return client
}

export function stripeMode(): 'test' | 'live' | null {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  return key.startsWith('sk_live_') || key.startsWith('rk_live_') ? 'live' : 'test'
}

/**
 * The Stripe price for a plan and interval. Products and prices are created on first use, identified by lookup key,
 * so nothing has to be set up by hand in the Stripe dashboard. When the amount in Trefort changes, a new price takes
 * over the lookup key; existing subscribers stay on their old price until they change plans.
 */
export async function ensurePrice(stripe: Stripe, plan: PlanPrice, interval: BillingInterval): Promise<string> {
  const amount = interval === 'month' ? plan.monthly_price_cents : plan.yearly_price_cents
  if (amount === null) throw new Error(`The ${plan.name} plan has no ${interval}ly price yet.`)
  const lookupKey = priceLookupKey(plan.key, interval)

  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 })
  const current = existing.data[0]
  if (current && current.unit_amount === amount && current.currency === 'usd') return current.id

  const productId = current
    ? typeof current.product === 'string'
      ? current.product
      : current.product.id
    : await ensureProduct(stripe, plan)

  const price = await stripe.prices.create({
    product: productId,
    currency: 'usd',
    unit_amount: amount,
    recurring: { interval },
    lookup_key: lookupKey,
    transfer_lookup_key: true,
    metadata: { plan_key: plan.key, interval },
  })
  return price.id
}

async function ensureProduct(stripe: Stripe, plan: PlanPrice): Promise<string> {
  const found = await stripe.products.search({ query: `metadata['trefort_plan']:'${plan.key}'`, limit: 1 })
  if (found.data[0]) return found.data[0].id
  const product = await stripe.products.create({
    name: `Trefort ${plan.name}`,
    description: plan.tagline ?? undefined,
    metadata: { trefort_plan: plan.key },
  })
  return product.id
}

/** The customer portal needs a saved configuration; create a simple one on first use. */
export async function ensurePortalConfiguration(stripe: Stripe): Promise<string | undefined> {
  const configs = await stripe.billingPortal.configurations.list({ is_default: true, active: true, limit: 1 })
  if (configs.data[0]) return undefined
  const config = await stripe.billingPortal.configurations.create({
    business_profile: { headline: 'Manage your Trefort subscription' },
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ['email', 'address', 'name', 'tax_id'] },
      subscription_cancel: { enabled: true, mode: 'at_period_end' },
    },
  })
  return config.id
}
