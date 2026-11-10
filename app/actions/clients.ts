'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { canManage, getSession, requireManager, requireStaff } from '@/lib/session'
import { OVERLAY_FIELD, fromZodError, friendlyDbError, formValues, type ActionState } from '@/lib/action-state'
import { activitySchema, clientSchema, contactSchema } from '@/lib/validation'
import { getOrgFeatures } from '@/lib/features'
import { ADDITIONAL_CONTACT_PREFIX, MAX_ADDITIONAL_CONTACTS } from '@/lib/additional-contacts'
import { buildPrimaryContact } from '@/lib/primary-contact'
import { isSelectableContactRelationship } from '@/lib/domain'
import { findPossibleDuplicates, type DuplicateReason } from '@/lib/project-homeowners'
import { formatClientOptionDetail, formatClientOptionLabel } from '@/lib/client-options'
import { assignPrimaryClient, checkUnassignedProject } from '@/lib/project-client-assignment'
import type { ClientMailingAddress } from '@/components/projects/project-form'

const uuid = z.uuid()
const UNAVAILABLE_RELATIONSHIP =
  'This relationship is no longer available for homeowner contacts. Add agents, attorneys, and property managers as business contacts instead.'

type ClientCreator = { userId: string; organizationId: string }

async function getClientCreator(): Promise<{ creator: ClientCreator } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Your session has expired. Please sign in again.' }
  if (!session.organizationId || !session.role || session.role === 'client') {
    return { error: 'Your account is not associated with an active construction company.' }
  }
  if (!canManage(session.role)) return { error: 'Your role does not allow you to create clients.' }
  return { creator: { userId: session.userId, organizationId: session.organizationId } }
}

type ParsedClient = z.infer<typeof clientSchema>
type SaveClientResult =
  | { ok: true; id: string; client: ParsedClient; contactsFailed: boolean }
  | { ok: false; state: ActionState }

/**
 * `project_choice` decides what happens after the client saves:
 * - `later` (default): open the new client.
 * - `existing`: link to the chosen unassigned project, never replacing another homeowner.
 * - `new`: return the saved client instead of redirecting, so the same drawer continues to project setup.
 */
export async function createClientAction(_prev: InlineClientState, formData: FormData): Promise<InlineClientState> {
  const values = formValues(formData)
  const auth = await getClientCreator()
  if ('error' in auth) return { error: auth.error, values }

  const choice = values.project_choice === 'existing' || values.project_choice === 'new' ? values.project_choice : 'later'

  // Optional project link. Checked before the client is created so a bad choice saves nothing,
  // then rechecked atomically by the assignment itself in case the project was taken meanwhile.
  const rawProjectId = choice === 'existing' || !values.project_choice ? values.assign_project_id?.trim() : undefined
  const projectId = rawProjectId && rawProjectId !== 'none' ? rawProjectId : null
  if (choice === 'existing' && !projectId) {
    return { error: 'Please correct the highlighted fields.', fieldErrors: { assign_project_id: 'Select a project' }, values }
  }
  if (projectId) {
    const supabase = await createClient()
    const projectError = uuid.safeParse(projectId).success
      ? await checkUnassignedProject(supabase, auth.creator.organizationId, projectId)
      : 'Choose a project from the list or leave it empty.'
    if (projectError) {
      return { error: 'Please correct the highlighted fields.', fieldErrors: { assign_project_id: projectError }, values }
    }
  }

  const result = await saveNewClient(auth.creator, values)
  if (!result.ok) return result.state

  revalidatePath('/clients')
  if (choice === 'new') return savedClientState(result)
  if (projectId) {
    const link = await assignPrimaryClient(await createClient(), {
      ...auth.creator,
      projectId,
      clientId: result.id,
      expectedClientId: null,
    })
    revalidatePath('/projects')
    revalidatePath(`/projects/${projectId}`)
    if (!link.ok) {
      // The client is saved; the redirect leaves the form so resubmitting can't create a duplicate.
      redirect(`/clients/${result.id}?notice=project_not_linked&project=${projectId}`)
    }
  }
  redirect(`/clients/${result.id}?notice=${result.contactsFailed ? 'contacts_not_saved' : projectId ? 'created_linked' : 'created'}`)
}

export type InlineClientMatch = { id: string; label: string; reasons: DuplicateReason[]; selectable: boolean }
export type InlineClientState = ActionState & {
  client?: { id: string; label: string; detail?: string; address: ClientMailingAddress }
  matches?: InlineClientMatch[]
}

/**
 * Creates a client from the New Project form without leaving it. Possible duplicates are
 * returned for the user to pick from; a new record is only created once they confirm.
 */
export async function createClientInlineAction(_prev: InlineClientState, formData: FormData): Promise<InlineClientState> {
  const values = formValues(formData)
  const auth = await getClientCreator()
  if ('error' in auth) return { error: auth.error, values }

  const parsed = clientSchema.safeParse(values)
  if (!parsed.success) return { ...fromZodError(parsed.error), error: 'Please correct the highlighted fields.', values }

  if (values.confirm_new !== 'true') {
    const supabase = await createClient()
    const { data: existing } = await supabase
      .from('clients')
      .select('id, first_name, last_name, company_name, client_number, email, phone, alternate_phone, status')
      .eq('organization_id', auth.creator.organizationId)
      .limit(5000)
    const matches = findPossibleDuplicates(
      {
        first_name: parsed.data.first_name,
        last_name: parsed.data.last_name,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
        alternate_phone: parsed.data.alternate_phone ?? null,
      },
      existing ?? [],
    )
    if (matches.length > 0) {
      return {
        error: 'This may be an existing client. Select them below, or confirm this is a different person.',
        values,
        matches: matches.slice(0, 5).map(({ contact, reasons }) => ({
          id: contact.id,
          label: formatClientOptionLabel(contact),
          reasons,
          selectable: contact.status !== 'archived',
        })),
      }
    }
  }

  const result = await saveNewClient(auth.creator, values)
  if (!result.ok) return result.state

  revalidatePath('/clients')
  return savedClientState(result)
}

async function savedClientState(result: Extract<SaveClientResult, { ok: true }>): Promise<InlineClientState> {
  const { data: saved } = await (await createClient())
    .from('clients')
    .select('client_number')
    .eq('id', result.id)
    .maybeSingle()
  const c = result.client
  return {
    success: `${c.first_name} ${c.last_name} was added as a client.`,
    warning: result.contactsFailed
      ? 'The additional contacts could not be saved. Add them later from the client page.'
      : undefined,
    savedId: result.id,
    client: {
      id: result.id,
      label: formatClientOptionLabel({ ...c, company_name: c.company_name ?? null, client_number: saved?.client_number ?? null }),
      detail: formatClientOptionDetail(c),
      address: {
        address_line1: c.address_line1 ?? '',
        address_line2: c.address_line2 ?? '',
        city: c.city ?? '',
        state: c.state ?? '',
        postal_code: c.postal_code ?? '',
      },
    },
  }
}

async function saveNewClient(creator: ClientCreator, values: Record<string, string>): Promise<SaveClientResult> {
  const session = creator
  const fail = (state: ActionState): SaveClientResult => ({ ok: false, state })

  const parsed = clientSchema.safeParse(values)
  const extras = parseAdditionalContacts(values)

  if (extras.entries.length > 0) {
    const features = await getOrgFeatures(session.organizationId)
    if (!features.additional_contacts) {
      return fail({ error: 'Additional contacts are not enabled for your company.', values })
    }
  }
  if (extras.tooMany) {
    return fail({ error: `You can add up to ${MAX_ADDITIONAL_CONTACTS} additional contacts here. Add more from the client page.`, values })
  }

  if (!parsed.success || Object.keys(extras.fieldErrors).length > 0) {
    const base = parsed.success ? {} : (fromZodError(parsed.error).fieldErrors ?? {})
    return fail({ error: 'Please correct the highlighted fields.', fieldErrors: { ...base, ...extras.fieldErrors }, values })
  }

  const duplicateErrors: Record<string, string> = {}
  for (const { id, contact } of extras.entries) {
    if (matchesPrimary(contact, parsed.data)) {
      duplicateErrors[`${ADDITIONAL_CONTACT_PREFIX}${id}_first_name`] = 'This is the same person as the primary contact'
    }
  }
  if (Object.keys(duplicateErrors).length > 0) {
    return fail({ error: 'Please correct the highlighted fields.', fieldErrors: duplicateErrors, values })
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
    return fail({ error: message, values })
  }

  // Once migration 20261103000010 is applied, a trigger creates this row inside the
  // client insert. Until then (and as a guard) create it here, undoing the client on failure.
  const { data: existingPrimary } = await supabase
    .from('client_contacts')
    .select('id')
    .eq('client_id', data.id)
    .eq('is_primary', true)
    .is('archived_at', null)
    .maybeSingle()
  if (!existingPrimary) {
    const { error: primaryError } = await supabase.from('client_contacts').insert({
      ...buildPrimaryContact(parsed.data),
      client_id: data.id,
      organization_id: session.organizationId,
      created_by: session.userId,
    })
    if (primaryError) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[clients] primary contact failed', { code: primaryError.code, message: primaryError.message })
      }
      const { error: undoError } = await supabase.from('clients').delete().eq('id', data.id)
      if (undoError) return { ok: true, id: data.id, client: parsed.data, contactsFailed: true }
      return fail({ error: 'The client could not be saved because its primary contact failed. Nothing was saved; please try again.', values })
    }
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

  return { ok: true, id: data.id, client: parsed.data, contactsFailed }
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
    if (!isSelectableContactRelationship(result.data.relationship)) {
      fieldErrors[`${ADDITIONAL_CONTACT_PREFIX}${id}_relationship`] = UNAVAILABLE_RELATIONSHIP
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
  const values = formValues(formData)
  const parsed = clientSchema.safeParse(values)
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
  // The Clients list edits in a drawer and stays on the list, so it gets the result back instead of a redirect.
  if (values[OVERLAY_FIELD] === '1') return { savedId: clientId, success: 'Changes saved.' }
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
  if (!isSelectableContactRelationship(parsed.data.relationship)) {
    return { error: UNAVAILABLE_RELATIONSHIP, fieldErrors: { relationship: UNAVAILABLE_RELATIONSHIP } }
  }

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
  if (!isSelectableContactRelationship(parsed.data.relationship)) {
    const { data: current } = await supabase
      .from('client_contacts')
      .select('relationship')
      .eq('id', contactId)
      .eq('client_id', clientId)
      .eq('organization_id', session.organizationId)
      .maybeSingle()
    if (!current) return { error: 'Contact not found.' }
    if (!isSelectableContactRelationship(parsed.data.relationship, current.relationship)) {
      return { error: UNAVAILABLE_RELATIONSHIP, fieldErrors: { relationship: UNAVAILABLE_RELATIONSHIP } }
    }
  }
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
