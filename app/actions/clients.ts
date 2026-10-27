'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { canManage, getSession, requireManager, requireStaff } from '@/lib/session'
import { fromZodError, friendlyDbError, formValues, type ActionState } from '@/lib/action-state'
import { activitySchema, clientSchema, contactSchema } from '@/lib/validation'

const uuid = z.uuid()

export async function createClientAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData)
  const session = await getSession()
  if (!session) return { error: 'Your session has expired. Please sign in again.', values }
  if (!session.organizationId || !session.role || session.role === 'client') {
    return { error: 'Your account is not associated with an active construction company.', values }
  }
  if (!canManage(session.role)) return { error: 'Your role does not allow you to create clients.', values }

  const parsed = clientSchema.safeParse(values)
  if (!parsed.success) return { ...fromZodError(parsed.error), values }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('clients')
    .insert({
      ...parsed.data,
      organization_id: session.organizationId,
      created_by: session.userId,
      updated_by: session.userId,
      archived_at: parsed.data.status === 'archived' ? new Date().toISOString() : null,
    })
    .select('id')
    .single()
  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[clients] create failed', { code: error.code, message: error.message, details: error.details })
    }
    const message =
      error.code === '42501' ? 'The client could not be saved. Please try again.' : friendlyDbError(error)
    return { error: message, values }
  }

  revalidatePath('/clients')
  redirect(`/clients/${data.id}`)
}

export async function updateClientAction(
  clientId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireManager()
  if (!uuid.safeParse(clientId).success) return { error: 'Invalid client.' }
  const parsed = clientSchema.safeParse(formValues(formData))
  if (!parsed.success) return fromZodError(parsed.error)

  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('clients')
    .select('status, archived_at')
    .eq('id', clientId)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!existing) return { error: 'Client not found.' }

  const archivedAt =
    parsed.data.status === 'archived' ? (existing.archived_at ?? new Date().toISOString()) : null

  const { error } = await supabase
    .from('clients')
    .update({ ...parsed.data, archived_at: archivedAt, updated_by: session.userId })
    .eq('id', clientId)
    .eq('organization_id', session.organizationId)
  if (error) return { error: friendlyDbError(error) }

  revalidatePath(`/clients/${clientId}`)
  revalidatePath('/clients')
  redirect(`/clients/${clientId}`)
}

export async function addContactAction(
  clientId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireManager()
  if (!uuid.safeParse(clientId).success) return { error: 'Invalid client.' }
  const parsed = contactSchema.safeParse(formValues(formData))
  if (!parsed.success) return fromZodError(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase.from('client_contacts').insert({
    ...parsed.data,
    client_id: clientId,
    organization_id: session.organizationId,
    created_by: session.userId,
  })
  if (error) return { error: friendlyDbError(error) }

  revalidatePath(`/clients/${clientId}`)
  return { success: 'Contact added.' }
}

export async function updateContactAction(
  clientId: string,
  contactId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireManager()
  if (!uuid.safeParse(clientId).success || !uuid.safeParse(contactId).success) return { error: 'Invalid contact.' }
  const parsed = contactSchema.safeParse(formValues(formData))
  if (!parsed.success) return fromZodError(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase
    .from('client_contacts')
    .update(parsed.data)
    .eq('id', contactId)
    .eq('client_id', clientId)
    .eq('organization_id', session.organizationId)
  if (error) return { error: friendlyDbError(error) }

  revalidatePath(`/clients/${clientId}`)
  return { success: 'Contact updated.' }
}

async function setContactArchived(clientId: string, contactId: string, archived: boolean): Promise<ActionState> {
  const session = await requireManager()
  if (!uuid.safeParse(clientId).success || !uuid.safeParse(contactId).success) return { error: 'Invalid contact.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('client_contacts')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', contactId)
    .eq('client_id', clientId)
    .eq('organization_id', session.organizationId)
  if (error) return { error: friendlyDbError(error) }

  revalidatePath(`/clients/${clientId}`)
  return { success: archived ? 'Contact removed. Their history is kept.' : 'Contact restored.' }
}

export async function archiveContactAction(clientId: string, contactId: string): Promise<ActionState> {
  return setContactArchived(clientId, contactId, true)
}

export async function restoreContactAction(clientId: string, contactId: string): Promise<ActionState> {
  return setContactArchived(clientId, contactId, false)
}

export async function setPrimaryContactAction(clientId: string, contactId: string): Promise<ActionState> {
  await requireManager()
  if (!uuid.safeParse(clientId).success || !uuid.safeParse(contactId).success) return { error: 'Invalid contact.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('set_primary_client_contact', { p_contact: contactId })
  if (error) return { error: friendlyDbError(error) }

  revalidatePath(`/clients/${clientId}`)
  return { success: 'Primary contact updated.' }
}

export async function addActivityAction(
  clientId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireStaff()
  if (!uuid.safeParse(clientId).success) return { error: 'Invalid client.' }
  const parsed = activitySchema.safeParse(formValues(formData))
  if (!parsed.success) return fromZodError(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase.from('client_activity').insert({
    ...parsed.data,
    client_id: clientId,
    organization_id: session.organizationId,
    created_by: session.userId,
  })
  if (error) return { error: friendlyDbError(error) }

  revalidatePath(`/clients/${clientId}`)
  return { success: 'Activity logged.' }
}

export async function inviteClientToPortalAction(clientId: string): Promise<ActionState> {
  const session = await requireManager()
  if (!uuid.safeParse(clientId).success) return { error: 'Invalid client.' }

  const supabase = await createClient()
  const { data: client } = await supabase
    .from('clients')
    .select('email, portal_user_id')
    .eq('id', clientId)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!client) return { error: 'Client not found.' }
  if (client.portal_user_id) return { error: 'This client already has portal access.' }
  if (!client.email) return { error: 'Add an email address to this client before inviting them.' }

  const { error } = await supabase.from('invitations').insert({
    organization_id: session.organizationId,
    email: client.email.toLowerCase(),
    role: 'client',
    client_id: clientId,
    invited_by: session.userId,
  })
  if (error) {
    if (error.code === '23505') return { error: 'An invitation is already pending for this email.' }
    return { error: friendlyDbError(error) }
  }

  revalidatePath(`/clients/${clientId}`)
  return {
    success: `Portal invitation created. Ask ${client.email} to sign up with that address to access the homeowner portal.`,
  }
}
