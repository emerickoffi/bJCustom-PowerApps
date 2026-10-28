'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { canManage, getSession, requireManager, requireStaff } from '@/lib/session'
import { fromZodError, friendlyDbError, formValues, type ActionState } from '@/lib/action-state'
import { activitySchema, clientSchema, contactSchema } from '@/lib/validation'
import { getOrgFeatures } from '@/lib/features'
import { ADDITIONAL_CONTACT_PREFIX, MAX_ADDITIONAL_CONTACTS } from '@/lib/additional-contacts'

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
  const extras = parseAdditionalContacts(values)

  if (extras.entries.length > 0) {
    const features = await getOrgFeatures(session.organizationId)
    if (!features.additional_contacts) {
      return { error: 'Additional contacts are not enabled for your company.', values }
    }
  }
  if (extras.tooMany) {
    return { error: `You can add up to ${MAX_ADDITIONAL_CONTACTS} additional contacts here. Add more from the client page.`, values }
  }

  if (!parsed.success || Object.keys(extras.fieldErrors).length > 0) {
    const base = parsed.success ? {} : (fromZodError(parsed.error).fieldErrors ?? {})
    return { error: 'Please correct the highlighted fields.', fieldErrors: { ...base, ...extras.fieldErrors }, values }
  }

  const duplicateErrors: Record<string, string> = {}
  for (const { id, contact } of extras.entries) {
    if (matchesPrimary(contact, parsed.data)) {
      duplicateErrors[`${ADDITIONAL_CONTACT_PREFIX}${id}_first_name`] = 'This is the same person as the primary contact'
    }
  }
  if (Object.keys(duplicateErrors).length > 0) {
    return { error: 'Please correct the highlighted fields.', fieldErrors: duplicateErrors, values }
  }

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

  let contactsFailed = false
  if (extras.entries.length > 0) {
    const { error: contactsError } = await supabase.from('client_contacts').insert(
      extras.entries.map(({ contact }) => ({
        ...contact,
        is_primary: false,
        client_id: data.id,
        organization_id: session.organizationId,
        created_by: session.userId,
      })),
    )
    if (contactsError) {
      contactsFailed = true
      if (process.env.NODE_ENV !== 'production') {
        console.error('[clients] additional contacts failed', { code: contactsError.code, message: contactsError.message })
      }
    }
  }

  revalidatePath('/clients')
  redirect(contactsFailed ? `/clients/${data.id}?notice=contacts_not_saved` : `/clients/${data.id}`)
}

const ADDITIONAL_CONTACT_FIELDS = [
  'first_name',
  'middle_name',
  'last_name',
  'relationship',
  'email',
  'phone',
  'alternate_phone',
  'preferred_communication',
] as const
const ADDITIONAL_CONTACT_TEXT_FIELDS = ['first_name', 'middle_name', 'last_name', 'email', 'phone', 'alternate_phone'] as const

type ParsedContact = Omit<z.infer<typeof contactSchema>, never>

function parseAdditionalContacts(values: Record<string, string>) {
  const ids = new Set<string>()
  for (const key of Object.keys(values)) {
    const match = /^ac_(\d{1,4})_/.exec(key)
    if (match) ids.add(match[1])
  }

  const entries: { id: string; contact: ParsedContact }[] = []
  const fieldErrors: Record<string, string> = {}
  for (const id of ids) {
    const raw: Record<string, string> = {}
    for (const field of ADDITIONAL_CONTACT_FIELDS) {
      raw[field] = values[`${ADDITIONAL_CONTACT_PREFIX}${id}_${field}`] ?? ''
    }
    if (ADDITIONAL_CONTACT_TEXT_FIELDS.every((f) => !raw[f].trim())) continue
    if (raw.relationship === 'primary_owner') raw.relationship = 'other'

    const result = contactSchema.safeParse({ ...raw, portal_enabled: false, portal_view_reports: false, portal_validate_issues: false, portal_acknowledge: false, portal_sign: false })
    if (!result.success) {
      for (const issue of result.error.issues) {
        const key = `${ADDITIONAL_CONTACT_PREFIX}${id}_${issue.path.join('.')}`
        if (!fieldErrors[key]) fieldErrors[key] = issue.message
      }
      continue
    }
    entries.push({ id, contact: result.data })
  }
  return { entries, fieldErrors, tooMany: ids.size > MAX_ADDITIONAL_CONTACTS }
}

function matchesPrimary(
  contact: ParsedContact,
  primary: { first_name: string; last_name: string; email: string | null | undefined },
) {
  const same = (a?: string | null, b?: string | null) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()
  if (contact.email && primary.email) return same(contact.email, primary.email)
  return same(contact.first_name, primary.first_name) && same(contact.last_name, primary.last_name)
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
