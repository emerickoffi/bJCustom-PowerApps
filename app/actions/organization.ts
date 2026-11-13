'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSession, requireAdmin } from '@/lib/session'
import { fromZodError, friendlyDbError, formValues, type ActionState } from '@/lib/action-state'
import { parseVisibility, serializeDashboardSettings, validateLayout } from '@/lib/dashboard-visibility'
import { organizationOnboardingSchema, organizationSettingsSchema, profileSchema } from '@/lib/validation'
import {
  COMPANY_LOGOS_BUCKET,
  isOwnStoredLogo,
  logoStoragePath,
  validateLogoUpload,
  versionedLogoUrl,
} from '@/lib/company-logo'

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

export type LogoActionResult = { error: string } | { success: string; logoUrl: string | null }

/**
 * Uploads (or replaces) the admin's own company logo and makes it the active logo. Authorization is
 * enforced twice: requireAdmin here, and the company-logos storage policies plus the organizations
 * update policy in the database, which only allow org admins to write their own organization.
 */
export async function uploadCompanyLogoAction(formData: FormData): Promise<LogoActionResult> {
  const session = await requireAdmin()
  const file = formData.get('logo')
  if (!(file instanceof File)) return { error: 'Choose an image file to upload.' }

  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const checked = validateLogoUpload({ size: file.size, type: file.type, bytes: head })
  if (!checked.ok) return { error: checked.error }

  const supabase = await createClient()
  const path = logoStoragePath(session.organizationId)
  const bucket = supabase.storage.from(COMPANY_LOGOS_BUCKET)
  const { error: uploadError } = await bucket.upload(path, file, {
    contentType: checked.mime,
    upsert: true,
    cacheControl: '3600',
  })
  if (uploadError) {
    return {
      error: /bucket not found/i.test(uploadError.message)
        ? 'Logo storage is not set up yet. Ask an administrator to apply the company logo storage migration.'
        : 'The logo could not be uploaded. Please try again.',
    }
  }

  const logoUrl = versionedLogoUrl(bucket.getPublicUrl(path).data.publicUrl, Date.now())
  const { data, error } = await supabase
    .from('organizations')
    .update({ logo_url: logoUrl })
    .eq('id', session.organizationId)
    .select('id')
  if (error) return { error: friendlyDbError(error) }
  if (!data?.length) return { error: 'You do not have permission to change the company logo.' }

  revalidatePath('/', 'layout')
  return { success: 'Logo uploaded.', logoUrl }
}

/** Clears the active logo only; colors and other branding settings are untouched. */
export async function removeCompanyLogoAction(): Promise<LogoActionResult> {
  const session = await requireAdmin()
  const supabase = await createClient()

  const { data: current } = await supabase
    .from('organizations')
    .select('logo_url')
    .eq('id', session.organizationId)
    .maybeSingle()

  const { data, error } = await supabase
    .from('organizations')
    .update({ logo_url: null })
    .eq('id', session.organizationId)
    .select('id')
  if (error) return { error: friendlyDbError(error) }
  if (!data?.length) return { error: 'You do not have permission to change the company logo.' }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (supabaseUrl && isOwnStoredLogo(current?.logo_url, session.organizationId, supabaseUrl)) {
    await supabase.storage.from(COMPANY_LOGOS_BUCKET).remove([logoStoragePath(session.organizationId)])
  }

  revalidatePath('/', 'layout')
  return { success: 'Logo removed.', logoUrl: null }
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
