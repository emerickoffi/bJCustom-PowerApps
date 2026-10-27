'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient, generateTemporaryPassword, temporaryCredentialExpiry } from '@/lib/supabase/admin'
import { getSession, requireAdmin, type StaffSession } from '@/lib/session'
import { fromZodError, friendlyDbError, formValues, type ActionState } from '@/lib/action-state'

export type ProvisionState = ActionState & {
  credential?: { email: string; password: string; expiresAt: string }
}

const staffRoles = ['org_admin', 'project_manager', 'builder_staff'] as const

const staffAccountSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter the staff member’s name').max(120),
  email: z.email('Enter a valid email address').trim().toLowerCase().max(254),
  role: z.enum(staffRoles, 'Select a role'),
})

type Admin = ReturnType<typeof createAdminClient>

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

async function findUserIdByEmail(admin: Admin, email: string): Promise<string | null> {
  const { data } = await admin.from('profiles').select('id').ilike('email', escapeLike(email)).limit(1).maybeSingle()
  return data?.id ?? null
}

async function createAuthUser(admin: Admin, email: string, fullName: string) {
  const password = generateTemporaryPassword()
  const expiresAt = temporaryCredentialExpiry()
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: { temp_credential_expires_at: expiresAt },
  })
  if (error || !data.user) {
    if (error?.message?.toLowerCase().includes('already')) {
      return { error: 'An account with this email already exists but could not be matched. Contact support.' } as const
    }
    return { error: 'The account could not be created. Please try again.' } as const
  }
  await admin.from('profiles').upsert({ id: data.user.id, full_name: fullName, email }, { onConflict: 'id' })
  return { userId: data.user.id, password, expiresAt } as const
}

async function validProjectIds(session: StaffSession, ids: string[]) {
  const unique = [...new Set(ids)].filter((id) => z.uuid().safeParse(id).success)
  if (!unique.length) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('projects')
    .select('id')
    .eq('organization_id', session.organizationId)
    .in('id', unique)
  return (data ?? []).map((p) => p.id as string)
}

export async function createStaffAccountAction(_prev: ProvisionState, formData: FormData): Promise<ProvisionState> {
  const session = await requireAdmin()
  const values = formValues(formData)
  const parsed = staffAccountSchema.safeParse(values)
  if (!parsed.success) return { ...fromZodError(parsed.error), values }
  const { full_name, email, role } = parsed.data
  const projectIds = await validProjectIds(session, formData.getAll('project_ids').map(String))

  const admin = createAdminClient()
  const existingId = await findUserIdByEmail(admin, email)

  if (existingId) {
    const { data: memberships } = await admin
      .from('organization_memberships')
      .select('organization_id')
      .eq('user_id', existingId)
    if (memberships?.some((m) => m.organization_id === session.organizationId)) {
      return { error: 'This person is already a member of your organization.', values }
    }
    if (memberships?.length) {
      return { error: 'This email belongs to an account in another organization and cannot be added here.', values }
    }
  }

  let userId = existingId
  let credential: ProvisionState['credential']
  if (!userId) {
    const created = await createAuthUser(admin, email, full_name)
    if ('error' in created) return { error: created.error, values }
    userId = created.userId
    credential = { email, password: created.password, expiresAt: created.expiresAt }
  }

  const { data: membership, error: membershipError } = await admin
    .from('organization_memberships')
    .insert({
      organization_id: session.organizationId,
      user_id: userId,
      role,
      status: 'active',
      invited_by: session.userId,
      activation_required: Boolean(credential),
    })
    .select('id')
    .single()

  if (membershipError || !membership) {
    if (credential) await admin.auth.admin.deleteUser(userId)
    return { error: 'The account could not be added to your organization. Nothing was saved; please try again.', values }
  }

  if (projectIds.length) {
    const supabase = await createClient()
    const { error } = await supabase.from('project_members').insert(
      projectIds.map((project_id) => ({
        organization_id: session.organizationId,
        project_id,
        user_id: userId,
        created_by: session.userId,
      })),
    )
    if (error) {
      await admin.from('organization_memberships').delete().eq('id', membership.id)
      if (credential) await admin.auth.admin.deleteUser(userId)
      return { error: `Project assignment failed, so the account was not created. ${friendlyDbError(error)}`, values }
    }
  }

  revalidatePath('/team')
  return {
    success: credential
      ? `Account created for ${full_name}. Share the temporary password below in person or by phone. It is shown only once.`
      : `${full_name} already had an account and now has access to your organization with their existing password.`,
    credential,
  }
}

async function reissueCredential(admin: Admin, userId: string, email: string): Promise<ProvisionState> {
  const password = generateTemporaryPassword()
  const expiresAt = temporaryCredentialExpiry()
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password,
    app_metadata: { temp_credential_expires_at: expiresAt },
  })
  if (error) return { error: 'A new temporary password could not be issued. Please try again.' }
  return {
    success: 'New temporary password issued. The previous one no longer works. It is shown only once.',
    credential: { email, password, expiresAt },
  }
}

/** Only for accounts that have not activated yet; activated users reset their own password. */
export async function reissueTemporaryPasswordAction(_prev: ProvisionState, formData: FormData): Promise<ProvisionState> {
  const session = await requireAdmin()
  const membershipId = String(formData.get('membership_id') ?? '')
  if (!z.uuid().safeParse(membershipId).success) return { error: 'Invalid account.' }

  const admin = createAdminClient()
  const { data: m } = await admin
    .from('organization_memberships')
    .select('user_id, activation_required')
    .eq('id', membershipId)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!m) return { error: 'Account not found.' }
  if (!m.activation_required) return { error: 'This account is already activated. They can reset their own password.' }
  if (m.user_id === session.userId) return { error: 'You cannot reissue your own credentials.' }

  const { data: profile } = await admin.from('profiles').select('email').eq('id', m.user_id).maybeSingle()
  const result = await reissueCredential(admin, m.user_id, profile?.email ?? '')
  revalidatePath('/team')
  return result
}

const portalAccountSchema = z.object({
  client_id: z.uuid(),
  contact: z.string().min(1, 'Select a homeowner contact'),
})

export async function createPortalAccountAction(_prev: ProvisionState, formData: FormData): Promise<ProvisionState> {
  const session = await requireAdmin()
  const parsed = portalAccountSchema.safeParse(formValues(formData))
  if (!parsed.success) return fromZodError(parsed.error)
  const { client_id, contact } = parsed.data
  const supabase = await createClient()

  const { data: client } = await supabase
    .from('clients')
    .select('id, first_name, last_name, email')
    .eq('id', client_id)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!client) return { error: 'Client not found.' }

  let contactId: string | null = null
  let fullName = `${client.first_name} ${client.last_name}`.trim()
  let email = client.email as string | null
  if (contact !== 'primary') {
    if (!z.uuid().safeParse(contact).success) return { error: 'Select a homeowner contact.' }
    const { data: c } = await supabase
      .from('client_contacts')
      .select('id, first_name, last_name, email')
      .eq('id', contact)
      .eq('client_id', client_id)
      .maybeSingle()
    if (!c) return { error: 'Contact not found for this client.' }
    contactId = c.id
    fullName = `${c.first_name} ${c.last_name}`.trim()
    email = c.email
  }
  email = email?.trim().toLowerCase() ?? null
  if (!email || !z.email().safeParse(email).success) {
    return { error: 'This contact needs a valid email address before portal access can be created.' }
  }

  const { data: linked } = await supabase.from('project_clients').select('project_id').eq('client_id', client_id)
  const linkedIds = new Set((linked ?? []).map((l) => l.project_id as string))
  const projectIds = (await validProjectIds(session, formData.getAll('project_ids').map(String))).filter((id) =>
    linkedIds.has(id),
  )

  const admin = createAdminClient()
  const existingId = await findUserIdByEmail(admin, email)
  let membershipCreated: string | null = null

  if (existingId) {
    const { data: memberships } = await admin
      .from('organization_memberships')
      .select('organization_id, role, client_id')
      .eq('user_id', existingId)
    const here = memberships?.find((m) => m.organization_id === session.organizationId)
    if (memberships?.some((m) => m.organization_id !== session.organizationId)) {
      return { error: 'This email belongs to an account in another organization.' }
    }
    if (here && here.role !== 'client') return { error: 'This email belongs to a staff member and cannot be a homeowner login.' }
    if (here && here.client_id && here.client_id !== client_id) {
      return { error: 'This email is already the portal login for a different client.' }
    }
    const { data: existingAccount } = await supabase
      .from('portal_accounts')
      .select('id')
      .eq('organization_id', session.organizationId)
      .eq('user_id', existingId)
      .maybeSingle()
    if (existingAccount) return { error: 'This homeowner already has portal access. Edit their projects below.' }
  }

  let userId = existingId
  let credential: ProvisionState['credential']
  if (!userId) {
    const created = await createAuthUser(admin, email, fullName)
    if ('error' in created) return { error: created.error }
    userId = created.userId
    credential = { email, password: created.password, expiresAt: created.expiresAt }
  }

  const rollback = async () => {
    if (membershipCreated) await admin.from('organization_memberships').delete().eq('id', membershipCreated)
    if (credential && userId) await admin.auth.admin.deleteUser(userId)
  }

  const { data: currentMembership } = await admin
    .from('organization_memberships')
    .select('id')
    .eq('organization_id', session.organizationId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!currentMembership) {
    const { data: inserted, error } = await admin
      .from('organization_memberships')
      .insert({
        organization_id: session.organizationId,
        user_id: userId,
        role: 'client',
        client_id,
        status: 'active',
        invited_by: session.userId,
        activation_required: Boolean(credential),
      })
      .select('id')
      .single()
    if (error || !inserted) {
      await rollback()
      return { error: 'Portal access could not be created. Nothing was saved; please try again.' }
    }
    membershipCreated = inserted.id
  }

  const { data: account, error: accountError } = await supabase
    .from('portal_accounts')
    .insert({ organization_id: session.organizationId, client_id, contact_id: contactId, user_id: userId, created_by: session.userId })
    .select('id')
    .single()
  if (accountError || !account) {
    await rollback()
    return { error: friendlyDbError(accountError) }
  }

  if (projectIds.length) {
    const { error } = await supabase.from('portal_project_access').insert(
      projectIds.map((project_id) => ({
        organization_id: session.organizationId,
        portal_account_id: account.id,
        user_id: userId,
        project_id,
        granted_by: session.userId,
      })),
    )
    if (error) {
      await supabase.from('portal_accounts').delete().eq('id', account.id)
      await rollback()
      return { error: `Project access could not be granted, so nothing was saved. ${friendlyDbError(error)}` }
    }
  }

  revalidatePath(`/clients/${client_id}`)
  return {
    success: credential
      ? `Portal login created for ${fullName}. Share the temporary password below directly with them. It is shown only once.`
      : `${fullName} already had a login. They can now see the selected projects with their existing password.`,
    credential,
  }
}

export async function updatePortalProjectsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin()
  const accountId = String(formData.get('portal_account_id') ?? '')
  if (!z.uuid().safeParse(accountId).success) return { error: 'Invalid portal account.' }
  const supabase = await createClient()

  const { data: account } = await supabase
    .from('portal_accounts')
    .select('id, client_id, user_id')
    .eq('id', accountId)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!account) return { error: 'Portal account not found.' }

  const { data: linked } = await supabase.from('project_clients').select('project_id').eq('client_id', account.client_id)
  const linkedIds = new Set((linked ?? []).map((l) => l.project_id as string))
  const wanted = new Set(
    (await validProjectIds(session, formData.getAll('project_ids').map(String))).filter((id) => linkedIds.has(id)),
  )

  const { data: current } = await supabase.from('portal_project_access').select('project_id').eq('portal_account_id', accountId)
  const have = new Set((current ?? []).map((c) => c.project_id as string))
  const toAdd = [...wanted].filter((id) => !have.has(id))
  const toRemove = [...have].filter((id) => !wanted.has(id))

  if (toRemove.length) {
    const { error } = await supabase
      .from('portal_project_access')
      .delete()
      .eq('portal_account_id', accountId)
      .in('project_id', toRemove)
    if (error) return { error: friendlyDbError(error) }
  }
  if (toAdd.length) {
    const { error } = await supabase.from('portal_project_access').insert(
      toAdd.map((project_id) => ({
        organization_id: session.organizationId,
        portal_account_id: accountId,
        user_id: account.user_id,
        project_id,
        granted_by: session.userId,
      })),
    )
    if (error) return { error: friendlyDbError(error) }
  }

  revalidatePath(`/clients/${account.client_id}`)
  return { success: 'Project access updated.' }
}

export async function setPortalStatusAction(accountId: string, status: 'active' | 'suspended'): Promise<ActionState> {
  const session = await requireAdmin()
  if (!z.uuid().safeParse(accountId).success || !['active', 'suspended'].includes(status)) {
    return { error: 'Invalid request.' }
  }
  const supabase = await createClient()
  const { data: account } = await supabase
    .from('portal_accounts')
    .select('client_id, user_id')
    .eq('id', accountId)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!account) return { error: 'Portal account not found.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('organization_memberships')
    .update({ status })
    .eq('organization_id', session.organizationId)
    .eq('user_id', account.user_id)
    .eq('role', 'client')
  if (error) return { error: 'Portal access could not be updated.' }

  revalidatePath(`/clients/${account.client_id}`)
  return { success: status === 'suspended' ? 'Portal access suspended.' : 'Portal access restored.' }
}

export async function reissuePortalPasswordAction(_prev: ProvisionState, formData: FormData): Promise<ProvisionState> {
  const session = await requireAdmin()
  const accountId = String(formData.get('portal_account_id') ?? '')
  if (!z.uuid().safeParse(accountId).success) return { error: 'Invalid portal account.' }
  const supabase = await createClient()
  const { data: account } = await supabase
    .from('portal_accounts')
    .select('client_id, user_id')
    .eq('id', accountId)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!account) return { error: 'Portal account not found.' }

  const admin = createAdminClient()
  const { data: m } = await admin
    .from('organization_memberships')
    .select('activation_required')
    .eq('organization_id', session.organizationId)
    .eq('user_id', account.user_id)
    .maybeSingle()
  if (!m?.activation_required) return { error: 'This homeowner already activated their login. They can reset their own password.' }

  const { data: profile } = await admin.from('profiles').select('email').eq('id', account.user_id).maybeSingle()
  const result = await reissueCredential(admin, account.user_id, profile?.email ?? '')
  revalidatePath(`/clients/${account.client_id}`)
  return result
}

const activationSchema = z
  .object({
    password: z.string().min(12, 'Use at least 12 characters').max(128),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })

export async function activateAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSession()
  if (!session) redirect('/auth/login')
  if (!session.activationRequired) redirect(session.role === 'client' ? '/portal' : '/dashboard')
  if (session.activationExpired) return { error: 'Your temporary password has expired. Ask your administrator for a new one.' }

  const parsed = activationSchema.safeParse(formValues(formData))
  if (!parsed.success) return fromZodError(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    if (error.code === 'same_password') return { fieldErrors: { password: 'Choose a password different from the temporary one.' } }
    if (error.code === 'weak_password') return { fieldErrors: { password: 'That password is too weak. Try a longer one.' } }
    return { error: 'Your password could not be updated. Please try again.' }
  }

  const admin = createAdminClient()
  await admin.auth.admin.updateUserById(session.userId, { app_metadata: { temp_credential_expires_at: null } })
  const { error: activationError } = await admin
    .from('organization_memberships')
    .update({ activation_required: false })
    .eq('user_id', session.userId)
    .eq('activation_required', true)
  if (activationError) return { error: 'Your password was saved, but activation could not finish. Please try again.' }

  redirect(session.role === 'client' ? '/portal' : '/dashboard')
}
