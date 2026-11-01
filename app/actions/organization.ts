'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSession, requireAdmin } from '@/lib/session'
import { fromZodError, friendlyDbError, formValues, type ActionState } from '@/lib/action-state'
import { parseVisibility, serializeDashboardSettings, validateLayout } from '@/lib/dashboard-visibility'
import { organizationOnboardingSchema, organizationSettingsSchema, profileSchema } from '@/lib/validation'

export async function createOrganizationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSession()
  if (!session) redirect('/auth/login')
  if (session.organizationId) redirect('/')

  const parsed = organizationOnboardingSchema.safeParse(formValues(formData))
  if (!parsed.success) return fromZodError(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase.rpc('create_organization', {
    p_display_name: parsed.data.display_name,
    p_legal_name: parsed.data.legal_name,
    p_phone: parsed.data.phone,
    p_email: parsed.data.email,
    p_city: parsed.data.city,
    p_state: parsed.data.state,
    p_project_prefix: parsed.data.project_prefix,
  })
  if (error) return { error: friendlyDbError(error) }

  redirect('/dashboard')
}

export async function updateOrganizationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin()
  const parsed = organizationSettingsSchema.safeParse(formValues(formData))
  if (!parsed.success) return fromZodError(parsed.error)

  const { project_number_prefix, ...org } = parsed.data
  const supabase = await createClient()

  const { error } = await supabase.from('organizations').update(org).eq('id', session.organizationId)
  if (error) return { error: friendlyDbError(error) }

  const { error: settingsError } = await supabase
    .from('organization_settings')
    .update({ project_number_prefix })
    .eq('organization_id', session.organizationId)
  if (settingsError) return { error: friendlyDbError(settingsError) }

  revalidatePath('/', 'layout')
  return { success: 'Organization settings saved.' }
}

/**
 * Saves Command Center visibility and card placement together for the admin's organization, in one column update.
 * `null` restores the built-in defaults. Admin-only here and in the organization_settings update RLS policy;
 * neither visibility nor placement changes module access, records, or permissions.
 */
export async function updateDashboardVisibilityAction(input: unknown): Promise<ActionState> {
  const session = await requireAdmin()
  let stored: Record<string, unknown> | null = null
  if (input !== null) {
    if (!input || typeof input !== 'object') return { error: 'Dashboard settings are invalid.' }
    const { visibility, layout } = input as { visibility?: unknown; layout?: unknown }
    const checked = validateLayout(layout)
    if ('error' in checked) return { error: checked.error }
    stored = serializeDashboardSettings({ visibility: parseVisibility(visibility), layout: checked.layout })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('organization_settings')
    .update({ dashboard_visibility: stored })
    .eq('organization_id', session.organizationId)
    .select('organization_id')
  if (error) return { error: friendlyDbError(error) }
  if (!data?.length) return { error: 'You do not have permission to change dashboard settings.' }

  revalidatePath('/dashboard')
  revalidatePath('/settings/dashboard')
  return { success: input === null ? 'Dashboard defaults restored.' : 'Dashboard settings saved.' }
}

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSession()
  if (!session) redirect('/auth/login')
  const parsed = profileSchema.safeParse(formValues(formData))
  if (!parsed.success) return fromZodError(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update(parsed.data).eq('id', session.userId)
  if (error) return { error: friendlyDbError(error) }

  revalidatePath('/', 'layout')
  return { success: 'Profile updated.' }
}
