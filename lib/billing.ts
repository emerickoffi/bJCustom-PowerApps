import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { BillingInterval, OrgBilling, PlanPrice } from '@/lib/billing-shared'

/** Null before the billing migration runs, which the app treats as full access. */
export const getOrgBilling = cache(async (organizationId: string): Promise<OrgBilling | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('organizations')
    .select('plan_key, subscription_status, trial_ends_at, current_period_end, cancel_at_period_end, billing_interval, stripe_subscription_id')
    .eq('id', organizationId)
    .maybeSingle()
  if (error || !data) return null
  return {
    plan_key: data.plan_key,
    subscription_status: data.subscription_status,
    trial_ends_at: data.trial_ends_at,
    current_period_end: data.current_period_end,
    cancel_at_period_end: Boolean(data.cancel_at_period_end),
    billing_interval: (data.billing_interval as BillingInterval | null) ?? null,
    has_subscription: Boolean(data.stripe_subscription_id),
  }
})

export async function getPublicPlans(): Promise<PlanPrice[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('key, name, tagline, sort_order, max_staff, monthly_price_cents, yearly_price_cents, is_public')
    .eq('is_public', true)
    .order('sort_order')
  return error ? [] : ((data ?? []) as PlanPrice[])
}
