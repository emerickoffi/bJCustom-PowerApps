import 'server-only'
import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeStripeStatus, parsePriceLookupKey } from '@/lib/billing-shared'

const iso = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000).toISOString() : null)

/**
 * Copies a Stripe subscription onto its company: plan, status, interval, dates. Runs with the service role
 * (the webhook and server actions), which is the only non-owner path allowed to change billing fields.
 * Returns the organization id it updated, or null when the subscription belongs to no known company.
 */
export async function syncSubscription(subscription: Stripe.Subscription): Promise<string | null> {
  const admin = createAdminClient()
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
  let orgId = subscription.metadata?.organization_id || null
  if (!orgId) {
    const { data } = await admin.from('organizations').select('id').eq('stripe_customer_id', customerId).maybeSingle()
    orgId = data?.id ?? null
  }
  if (!orgId) return null

  // Ignore stale events for a subscription the company has since replaced.
  const { data: org } = await admin
    .from('organizations')
    .select('stripe_subscription_id, plan_key')
    .eq('id', orgId)
    .maybeSingle()
  if (!org) return null
  const ended = subscription.status === 'canceled' || subscription.status === 'incomplete_expired'
  if (org.stripe_subscription_id && org.stripe_subscription_id !== subscription.id && ended) return orgId

  const item = subscription.items.data[0]
  const parsed = parsePriceLookupKey(item?.price?.lookup_key)
  let planKey = org.plan_key as string
  if (parsed) {
    const { data: plan } = await admin.from('subscription_plans').select('key').eq('key', parsed.planKey).maybeSingle()
    if (plan) planKey = plan.key
  }

  const { error } = await admin
    .from('organizations')
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      subscription_status: normalizeStripeStatus(subscription.status),
      plan_key: planKey,
      billing_interval: parsed?.interval ?? item?.price?.recurring?.interval ?? null,
      current_period_end: iso(item?.current_period_end),
      trial_ends_at: subscription.trial_end ? iso(subscription.trial_end) : null,
      cancel_at_period_end: Boolean(subscription.cancel_at_period_end || subscription.cancel_at),
      updated_at: new Date().toISOString(),
    })
    .eq('id', orgId)
  if (error) throw new Error(`Billing sync failed: ${error.message}`)
  return orgId
}
