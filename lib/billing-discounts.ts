import 'server-only'
import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe'
import { describeCoupon, type CompanyDiscount, type CouponOption } from '@/lib/billing-discounts-shared'

/**
 * Discounts live in Stripe; nothing is copied into the database.
 * - Subscribed company: the coupon sits on its Stripe subscription.
 * - Not subscribed yet: the coupon id is saved on its Stripe customer (metadata) and applied at Checkout.
 */
export const PENDING_COUPON_KEY = 'trefort_coupon'

type OrgStripeIds = { id: string; display_name: string; email: string | null; stripe_customer_id: string | null; stripe_subscription_id: string | null }

async function loadOrg(organizationId: string): Promise<OrgStripeIds | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('organizations')
    .select('id, display_name, email, stripe_customer_id, stripe_subscription_id')
    .eq('id', organizationId)
    .maybeSingle()
  return (data as OrgStripeIds | null) ?? null
}

/** The live subscription, or null when there is none or it has ended. */
async function liveSubscription(stripe: Stripe, subscriptionId: string | null): Promise<Stripe.Subscription | null> {
  if (!subscriptionId) return null
  const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['discounts.source.coupon'] })
  return ['canceled', 'incomplete_expired'].includes(sub.status) ? null : sub
}

function couponOf(discount: string | Stripe.Discount | undefined): Stripe.Coupon | null {
  if (!discount || typeof discount === 'string') return null
  const c = discount.source?.coupon
  return c && typeof c !== 'string' ? c : null
}

/** A usable coupon from its id, or null when it was deleted or can no longer be redeemed. */
export async function validCoupon(stripe: Stripe, couponId: string | null | undefined): Promise<Stripe.Coupon | null> {
  if (!couponId) return null
  try {
    const coupon = await stripe.coupons.retrieve(couponId)
    return coupon.valid ? coupon : null
  } catch {
    return null
  }
}

/** What a company's discount is right now, for the Billing page and the owner console. Never throws. */
export async function getCompanyDiscount(organizationId: string): Promise<CompanyDiscount | null> {
  const stripe = getStripe()
  if (!stripe) return null
  try {
    const org = await loadOrg(organizationId)
    if (!org) return null
    const sub = await liveSubscription(stripe, org.stripe_subscription_id)
    if (sub) {
      const discount = sub.discounts.find((d) => typeof d !== 'string') as Stripe.Discount | undefined
      const coupon = couponOf(discount)
      if (!discount || !coupon) return null
      return {
        couponId: coupon.id,
        label: describeCoupon(coupon),
        endsAt: discount.end ? new Date(discount.end * 1000).toISOString() : null,
        pending: false,
      }
    }
    if (!org.stripe_customer_id) return null
    const customer = await stripe.customers.retrieve(org.stripe_customer_id)
    if (customer.deleted) return null
    const coupon = await validCoupon(stripe, customer.metadata?.[PENDING_COUPON_KEY])
    return coupon ? { couponId: coupon.id, label: describeCoupon(coupon), endsAt: null, pending: true } : null
  } catch (error) {
    console.error('[billing] could not load discount', error)
    return null
  }
}

/** Coupons the owner can hand out: valid ones, newest first. */
export async function listCouponOptions(): Promise<CouponOption[]> {
  const stripe = getStripe()
  if (!stripe) return []
  try {
    const list = await stripe.coupons.list({ limit: 100 })
    return list.data.filter((c) => c.valid).map((c) => ({ id: c.id, label: describeCoupon(c) }))
  } catch (error) {
    console.error('[billing] could not list coupons', error)
    return []
  }
}

/** The company's Stripe customer, created on first use (same shape as at Checkout). */
export async function ensureCustomer(stripe: Stripe, org: OrgStripeIds): Promise<string> {
  if (org.stripe_customer_id) return org.stripe_customer_id
  const customer = await stripe.customers.create({
    name: org.display_name,
    email: org.email ?? undefined,
    metadata: { organization_id: org.id },
  })
  await createAdminClient().from('organizations').update({ stripe_customer_id: customer.id }).eq('id', org.id)
  return customer.id
}

/** Puts a coupon on the company, or removes its discount when couponId is null. Returns a message for the owner. */
export async function setCompanyDiscount(organizationId: string, couponId: string | null): Promise<string> {
  const stripe = getStripe()
  if (!stripe) throw new Error('Stripe is not connected.')
  const org = await loadOrg(organizationId)
  if (!org) throw new Error('Company not found.')

  let coupon: Stripe.Coupon | null = null
  if (couponId) {
    coupon = await validCoupon(stripe, couponId)
    if (!coupon) throw new Error('That coupon no longer exists or has expired.')
  }

  const sub = await liveSubscription(stripe, org.stripe_subscription_id)
  if (sub) {
    await stripe.subscriptions.update(sub.id, { discounts: coupon ? [{ coupon: coupon.id }] : '' })
    if (org.stripe_customer_id) await clearPendingCoupon(stripe, org.stripe_customer_id)
    return coupon
      ? `${describeCoupon(coupon)} applied. It shows on their next invoice.`
      : 'Discount removed. Their next invoice is at the full price.'
  }

  if (!coupon) {
    if (org.stripe_customer_id) await clearPendingCoupon(stripe, org.stripe_customer_id)
    return 'Discount removed.'
  }
  const customerId = await ensureCustomer(stripe, org)
  await stripe.customers.update(customerId, { metadata: { [PENDING_COUPON_KEY]: coupon.id } })
  return `${describeCoupon(coupon)} saved. It is applied automatically when they choose a plan.`
}

export async function clearPendingCoupon(stripe: Stripe, customerId: string): Promise<void> {
  await stripe.customers.update(customerId, { metadata: { [PENDING_COUPON_KEY]: '' } })
}

/** Creates a simple percentage coupon from the owner console. months null = forever. */
export async function createPercentCoupon(percentOff: number, months: number | null): Promise<Stripe.Coupon> {
  const stripe = getStripe()
  if (!stripe) throw new Error('Stripe is not connected.')
  const name = months ? `${percentOff}% off for ${months} month${months === 1 ? '' : 's'}` : `${percentOff}% off forever`
  return stripe.coupons.create({
    percent_off: percentOff,
    name,
    ...(months ? { duration: 'repeating' as const, duration_in_months: months } : { duration: 'forever' as const }),
    metadata: { created_in: 'trefort_owner_console' },
  })
}
