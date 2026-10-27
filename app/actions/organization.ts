'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSession, requireAdmin } from '@/lib/session'
import { fromZodError, friendlyDbError, formValues, type ActionState } from '@/lib/action-state'
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
