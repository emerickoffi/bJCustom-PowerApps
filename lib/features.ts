import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolveFeatures, type FeatureKey, type FeatureMap } from '@/lib/feature-registry'

export const getOrgFeatures = cache(async (organizationId: string): Promise<FeatureMap> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('organization_features')
    .select('feature_key, enabled')
    .eq('organization_id', organizationId)
  const overrides: Partial<Record<FeatureKey, boolean>> = {}
  for (const row of data ?? []) overrides[row.feature_key as FeatureKey] = row.enabled
  return resolveFeatures(overrides)
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
