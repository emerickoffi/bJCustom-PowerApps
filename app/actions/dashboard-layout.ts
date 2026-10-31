'use server'

import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { getOrgFeatures } from '@/lib/features'
import { LAYOUT_SCHEMA_VERSION, dashboardKeyForRole, normalizeLayoutForSave } from '@/lib/dashboard-layout'
import { widgetAvailability } from '@/lib/dashboard-layout-data'

export type LayoutActionResult = { ok: true } | { ok: false; error: string }

/** The dashboard key is derived from the session role, never from the client. */
async function context() {
  const session = await requireStaff()
  const key = dashboardKeyForRole(session.role)
  if (!key) throw new Error('No dashboard for this role.')
  return { session, key }
}

export async function saveDashboardLayoutAction(widgets: unknown): Promise<LayoutActionResult> {
  try {
    const { session, key } = await context()
    const features = await getOrgFeatures(session.organizationId)
    const layout = normalizeLayoutForSave(key, widgets, widgetAvailability(features))
    const supabase = await createClient()
    const { error } = await supabase.from('dashboard_layouts').upsert(
      {
        organization_id: session.organizationId,
        user_id: session.userId,
        dashboard_key: key,
        schema_version: LAYOUT_SCHEMA_VERSION,
        layout_configuration: layout,
      },
      { onConflict: 'organization_id,user_id,dashboard_key' },
    )
    if (error) return { ok: false, error: 'Your layout could not be saved. Try again.' }
    revalidatePath('/dashboard')
    return { ok: true }
  } catch {
    return { ok: false, error: 'Your layout could not be saved. Try again.' }
  }
}

export async function resetDashboardLayoutAction(): Promise<LayoutActionResult> {
  try {
    const { session, key } = await context()
    const supabase = await createClient()
    const { error } = await supabase
      .from('dashboard_layouts')
      .delete()
      .eq('organization_id', session.organizationId)
      .eq('user_id', session.userId)
      .eq('dashboard_key', key)
    if (error) return { ok: false, error: 'The default layout could not be restored. Try again.' }
    revalidatePath('/dashboard')
    return { ok: true }
  } catch {
    return { ok: false, error: 'The default layout could not be restored. Try again.' }
  }
}
