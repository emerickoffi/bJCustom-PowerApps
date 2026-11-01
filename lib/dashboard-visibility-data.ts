import 'server-only'
import { defaultSettings, parseDashboardSettings, type DashboardSettings } from '@/lib/dashboard-visibility'
import { createClient } from '@/lib/supabase/server'

/**
 * Reads the organization's saved Command Center visibility and placement. A failed read falls back to the
 * built-in defaults.
 */
export async function getDashboardVisibility(
  organizationId: string,
): Promise<{ settings: DashboardSettings; customized: boolean; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('organization_settings')
    .select('dashboard_visibility')
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) return { settings: defaultSettings(), customized: false, error: 'Saved dashboard settings could not be loaded.' }
  const raw = data?.dashboard_visibility ?? null
  return { settings: parseDashboardSettings(raw), customized: raw !== null, error: null }
}
