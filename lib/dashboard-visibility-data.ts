import 'server-only'
import { defaultVisibility, parseVisibility, type DashboardVisibility } from '@/lib/dashboard-visibility'
import { createClient } from '@/lib/supabase/server'

/** Reads the organization's saved Command Center visibility. A failed read falls back to the built-in defaults. */
export async function getDashboardVisibility(
  organizationId: string,
): Promise<{ settings: DashboardVisibility; customized: boolean; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('organization_settings')
    .select('dashboard_visibility')
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) return { settings: defaultVisibility(), customized: false, error: 'Saved dashboard settings could not be loaded.' }
  const raw = data?.dashboard_visibility ?? null
  return { settings: parseVisibility(raw), customized: raw !== null, error: null }
}
