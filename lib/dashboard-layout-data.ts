import 'server-only'
import { createClient } from '@/lib/supabase/server'
import {
  LAYOUT_SCHEMA_VERSION,
  parseLayoutEntries,
  resolveLayout,
  type DashboardKey,
  type ResolvedWidget,
  type WidgetRequirement,
} from '@/lib/dashboard-layout'
import type { FeatureMap } from '@/lib/feature-registry'

export function widgetAvailability(features: FeatureMap): Partial<Record<WidgetRequirement, boolean>> {
  return { schedule: features.schedule, warranty: features.warranty, daily_logs: features.daily_logs }
}

/**
 * The user's layout for one dashboard, resolved against current permissions. If the table is missing or the
 * read fails, the default layout is used; a preference problem must never break the dashboard.
 */
export async function loadDashboardLayout(
  organizationId: string,
  userId: string,
  key: DashboardKey,
  features: FeatureMap,
): Promise<{ widgets: ResolvedWidget[]; customized: boolean }> {
  const available = widgetAvailability(features)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('dashboard_layouts')
    .select('schema_version, layout_configuration')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .eq('dashboard_key', key)
    .maybeSingle()

  if (error || !data || data.schema_version > LAYOUT_SCHEMA_VERSION) {
    return { widgets: resolveLayout(key, null, available), customized: false }
  }
  return { widgets: resolveLayout(key, parseLayoutEntries(data.layout_configuration), available), customized: true }
}
