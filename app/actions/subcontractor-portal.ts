'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient, generateTemporaryPassword, temporaryCredentialExpiry } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/session'
import { getSubcontractorSession } from '@/lib/subcontractor-session'
import { fromZodError, friendlyDbError, formValues, type ActionState } from '@/lib/action-state'
import { isSubWorkSetupError } from '@/lib/subcontractor-work'

export type SubPortalState = ActionState & {
  credential?: { email: string; password: string; expiresAt: string }
}

const SETUP_MESSAGE = 'Subcontractor portal access is not set up in this environment yet. Ask an administrator to apply the pending migration.'

function dbError(error: { code?: string; message?: string }) {
  return isSubWorkSetupError(error) ? SETUP_MESSAGE : friendlyDbError(error)
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

const inviteSchema = z.object({
  company_id: z.uuid('Choose a subcontractor'),
  full_name: z.string().trim().min(2, 'Enter the person’s name').max(120),
  email: z.email('Enter a valid email address').trim().toLowerCase().max(254),
})

export async function inviteSubcontractorUserAction(_prev: SubPortalState, formData: FormData): Promise<SubPortalState> {
  const session = await requireAdmin()
  const values = formValues(formData)
  const parsed = inviteSchema.safeParse(values)
  if (!parsed.success) return { ...fromZodError(parsed.error), values }
  const { company_id, full_name, email } = parsed.data

  const supabase = await createClient()
  const { data: company } = await supabase
    .from('subcontractor_companies')
    .select('id, status')
    .eq('id', company_id)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!company) return { error: 'Subcontractor not found.' }
  if (company.status !== 'active') return { error: 'Reactivate this subcontractor before granting portal access.' }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('id').ilike('email', escapeLike(email)).limit(1).maybeSingle()
  let userId = profile?.id as string | undefined
  let credential: SubPortalState['credential']

  if (userId) {
    const { data: existing, error: existingError } = await supabase
      .from('subcontractor_portal_accounts')
      .select('id, status, subcontractor_company_id')
      .eq('organization_id', session.organizationId)
      .eq('user_id', userId)
      .maybeSingle()
    if (existingError) return { error: dbError(existingError), values }
    if (existing) {
      if (existing.subcontractor_company_id !== company_id) {
        return { error: 'This person already has portal access for another subcontractor in your organization.', values }
      }
      if (existing.status === 'active') return { error: 'This person already has portal access.', values }
      const { error } = await supabase.from('subcontractor_portal_accounts').update({ status: 'active', full_name }).eq('id', existing.id)
      if (error) return { error: dbError(error), values }
      revalidatePath(`/subcontractors/${company_id}`)
      return { success: 'Portal access restored. They can sign in with their existing password.' }
    }
  } else {
    const password = generateTemporaryPassword()
    const expiresAt = temporaryCredentialExpiry()
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
      app_metadata: { temp_credential_expires_at: expiresAt },
    })
    if (error || !data.user) return { error: 'The account could not be created. Please try again.', values }
    userId = data.user.id
    await admin.from('profiles').upsert({ id: userId, full_name, email }, { onConflict: 'id' })
    credential = { email, password, expiresAt }
  }

  const { error } = await supabase.from('subcontractor_portal_accounts').insert({
    organization_id: session.organizationId,
    subcontractor_company_id: company_id,
    user_id: userId,
    full_name,
    email,
  })
  if (error) {
    if (credential) await admin.auth.admin.deleteUser(userId)
    return { error: dbError(error), values }
  }
  revalidatePath(`/subcontractors/${company_id}`)
  return credential
    ? { success: 'Portal account created. Share the temporary password securely.', credential }
    : { success: 'Portal access granted. They can sign in with their existing password.' }
}

export async function setSubcontractorUserStatusAction(accountId: string, status: 'active' | 'revoked'): Promise<ActionState> {
  const session = await requireAdmin()
  if (!z.uuid().safeParse(accountId).success || !['active', 'revoked'].includes(status)) return { error: 'Invalid request.' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('subcontractor_portal_accounts')
    .update({ status })
    .eq('id', accountId)
    .eq('organization_id', session.organizationId)
    .select('subcontractor_company_id')
  if (error) return { error: dbError(error) }
  if (!data?.length) return { error: 'Portal account not found.' }
  revalidatePath(`/subcontractors/${data[0].subcontractor_company_id}`)
  return { success: status === 'revoked' ? 'Portal access revoked.' : 'Portal access restored.' }
}

export async function reissueSubcontractorPasswordAction(accountId: string): Promise<SubPortalState> {
  const session = await requireAdmin()
  if (!z.uuid().safeParse(accountId).success) return { error: 'Invalid request.' }
  const supabase = await createClient()
  const { data: account } = await supabase
    .from('subcontractor_portal_accounts')
    .select('user_id, email, status, subcontractor_company_id')
    .eq('id', accountId)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!account) return { error: 'Portal account not found.' }
  if (account.status !== 'active') return { error: 'Restore access before issuing a new password.' }
  const admin = createAdminClient()
  const { data: user } = await admin.auth.admin.getUserById(account.user_id as string)
  if (!user.user?.app_metadata?.temp_credential_expires_at) {
    return { error: 'This person has already set their own password. They can reset it from the sign-in page.' }
  }
  const password = generateTemporaryPassword()
  const expiresAt = temporaryCredentialExpiry()
  const { error } = await admin.auth.admin.updateUserById(account.user_id as string, {
    password,
    app_metadata: { temp_credential_expires_at: expiresAt },
  })
  if (error) return { error: 'A new password could not be issued. Please try again.' }
  revalidatePath(`/subcontractors/${account.subcontractor_company_id}`)
  return { success: 'New temporary password issued.', credential: { email: account.email as string, password, expiresAt } }
}

const activationSchema = z
  .object({
    password: z.string().min(12, 'Use at least 12 characters').max(128),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })

export async function activateSubcontractorAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSubcontractorSession()
  if (!session) redirect('/auth/login')
  if (!session.activationRequired) redirect('/sub')
  if (session.activationExpired) return { error: 'Your temporary password has expired. Ask the builder for a new one.' }
  const parsed = activationSchema.safeParse(formValues(formData))
  if (!parsed.success) return fromZodError(parsed.error)
  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    if (error.code === 'same_password') return { fieldErrors: { password: 'Choose a password different from the temporary one.' } }
    if (error.code === 'weak_password') return { fieldErrors: { password: 'Choose a stronger password.' } }
    return { error: 'Your password could not be updated. Please try again.' }
  }
  const admin = createAdminClient()
  await admin.auth.admin.updateUserById(session.userId, { app_metadata: { temp_credential_expires_at: null } })
  await supabase.auth.refreshSession()
  redirect('/sub')
}
