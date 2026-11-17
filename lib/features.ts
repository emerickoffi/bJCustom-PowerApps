import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { FEATURES, isSwitchable, resolveFeatures, type FeatureKey, type FeatureMap } from '@/lib/feature-registry'
import { applyPlanToOverrides, type PlanAccess, type PlanSummary } from '@/lib/plans-shared'

const SWITCHABLE_KEYS = FEATURES.filter(isSwitchable).map((f) => f.key)

/**
 * The plan's module list. Null when plans are not set up in this database yet (the migration has not run),
 * in which case nothing is restricted, matching the database before plans existed.
 */
export const getOrgPlanAccess = cache(async (organizationId: string): Promise<PlanAccess | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('organizations')
    .select('plan_key, subscription_plans(all_features, features)')
    .eq('id', organizationId)
    .maybeSingle()
  if (error || !data) return null
  const plan = (data as { subscription_plans: PlanAccess | PlanAccess[] | null }).subscription_plans
  const row = Array.isArray(plan) ? plan[0] : plan
  return row ? { all_features: row.all_features, features: row.features ?? [] } : null
})

/** Plan name, seats and upgrade targets for the company's own staff. Null when unavailable. */
export const getOrgPlanSummary = cache(async (organizationId: string): Promise<PlanSummary | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('organization_plan_summary', { p_org: organizationId })
  if (error || !data) return null
  return data as PlanSummary
})

export const getOrgFeatures = cache(async (organizationId: string): Promise<FeatureMap> => {
  const supabase = await createClient()
  const [{ data }, plan] = await Promise.all([
    supabase.from('organization_features').select('feature_key, enabled').eq('organization_id', organizationId),
    getOrgPlanAccess(organizationId),
  ])
  const overrides: Partial<Record<FeatureKey, boolean>> = {}
  for (const row of data ?? []) overrides[row.feature_key as FeatureKey] = row.enabled
  return resolveFeatures(applyPlanToOverrides(overrides, plan, SWITCHABLE_KEYS))
})

export async function requireFeature(organizationId: string, key: FeatureKey, fallback = '/dashboard') {
  return requireAnyFeature(organizationId, [key], fallback)
}

export async function requireAnyFeature(organizationId: string | null, keys: FeatureKey[], fallback = '/dashboard') {
  if (!organizationId) redirect(fallback)
  const features = await getOrgFeatures(organizationId)
  if (!keys.some((k) => features[k])) redirect(fallback)
  return features
}
