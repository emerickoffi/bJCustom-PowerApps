'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrgBilling, getPublicPlans } from '@/lib/billing'
import { ensurePortalConfiguration, ensurePrice, getStripe } from '@/lib/stripe'
import { syncSubscription } from '@/lib/stripe-sync'
import { PENDING_COUPON_KEY, validCoupon } from '@/lib/billing-discounts'
import { requestOrigin } from '@/lib/invitations'
import type { ActionState } from '@/lib/action-state'

const choice = z.object({
  plan: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/),
  interval: z.enum(['month', 'year']),
})

const NOT_CONFIGURED = 'Online billing is not connected yet. Contact Trefort to change your plan.'

function stripeError(error: unknown): string {
  console.error('[billing] Stripe error', error)
  return 'Stripe could not complete that request. Nothing was charged. Please try again in a moment.'
}

/** New subscribers go to Stripe Checkout; existing subscribers switch plans in place with proration. */
export async function choosePlanAction(plan: string, interval: string): Promise<ActionState> {
  const session = await requireAdmin()
  const parsed = choice.safeParse({ plan, interval })
  if (!parsed.success) return { error: 'Choose a plan.' }
  const stripe = getStripe()
  if (!stripe) return { error: NOT_CONFIGURED }

  const [plans, billing] = await Promise.all([getPublicPlans(), getOrgBilling(session.organizationId)])
  const target = plans.find((p) => p.key === parsed.data.plan)
  if (!target || !billing) return { error: 'That plan is not available.' }
  if (billing.subscription_status === 'internal') return { error: 'This company is on an internal plan and is never billed.' }

  const admin = createAdminClient()
  const { data: org } = await admin
    .from('organizations')
    .select('id, display_name, email, stripe_customer_id, stripe_subscription_id')
    .eq('id', session.organizationId)
    .single()
  if (!org) return { error: 'Company not found.' }

  let checkoutUrl: string | null = null
  try {
    const priceId = await ensurePrice(stripe, target, parsed.data.interval)

    // Already subscribed: change the plan on the existing subscription.
    if (org.stripe_subscription_id) {
      const sub = await stripe.subscriptions.retrieve(org.stripe_subscription_id)
      if (!['canceled', 'incomplete_expired'].includes(sub.status)) {
        const item = sub.items.data[0]
        if (item?.price.id === priceId) return { success: 'You are already on this plan.' }
        const updated = await stripe.subscriptions.update(sub.id, {
          items: [{ id: item.id, price: priceId }],
          proration_behavior: 'create_prorations',
          cancel_at_period_end: false,
          metadata: { organization_id: org.id },
        })
        await syncSubscription(updated)
        revalidatePath('/', 'layout')
        return { success: `You are now on the ${target.name} plan. Any difference is prorated on your next invoice.` }
      }
    }

    let customerId = org.stripe_customer_id as string | null
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: org.display_name,
        email: org.email ?? session.email ?? undefined,
        metadata: { organization_id: org.id },
      })
      customerId = customer.id
      await admin.from('organizations').update({ stripe_customer_id: customerId }).eq('id', org.id)
    }

    // Keep any unused trial days: Stripe starts billing when the Trefort trial would have ended.
    const trialEnd = billing.trial_ends_at ? Math.floor(Date.parse(billing.trial_ends_at) / 1000) : null
    const keepTrial = billing.subscription_status === 'trialing' && trialEnd && trialEnd - Date.now() / 1000 > 48 * 3600

    // A discount Trefort saved for this company is applied automatically; otherwise customers can enter a promo code.
    // (Stripe allows one or the other on a checkout page, not both.)
    const customer = await stripe.customers.retrieve(customerId)
    const savedCoupon = customer.deleted ? null : await validCoupon(stripe, customer.metadata?.[PENDING_COUPON_KEY])

    const origin = await requestOrigin()
    const checkout = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: org.id,
      line_items: [{ price: priceId, quantity: 1 }],
      ...(savedCoupon ? { discounts: [{ coupon: savedCoupon.id }] } : { allow_promotion_codes: true }),
      billing_address_collection: 'auto',
      metadata: { organization_id: org.id },
      subscription_data: { metadata: { organization_id: org.id }, ...(keepTrial ? { trial_end: trialEnd! } : {}) },
      success_url: `${origin}/billing?checkout={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing?checkout=cancelled`,
    })
    checkoutUrl = checkout.url
  } catch (error) {
    return { error: stripeError(error) }
  }
  if (!checkoutUrl) return { error: 'Stripe did not return a checkout page. Please try again.' }
  redirect(checkoutUrl)
}

/** Card, invoices, billing details and cancellation, handled on Stripe's own secure page. */
export async function openBillingPortalAction(): Promise<ActionState> {
  const session = await requireAdmin()
  const stripe = getStripe()
  if (!stripe) return { error: NOT_CONFIGURED }
  const admin = createAdminClient()
  const { data: org } = await admin.from('organizations').select('stripe_customer_id').eq('id', session.organizationId).single()
  if (!org?.stripe_customer_id) return { error: 'Choose a plan first. Billing details appear here after your first checkout.' }

  let url: string
  try {
    const configuration = await ensurePortalConfiguration(stripe)
    const portal = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: `${await requestOrigin()}/billing`,
      ...(configuration ? { configuration } : {}),
    })
    url = portal.url
  } catch (error) {
    return { error: stripeError(error) }
  }
  redirect(url)
}
