'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/session'
import { fromZodError, friendlyDbError, formValues, type ActionState } from '@/lib/action-state'
import { contactSchema } from '@/lib/validation'
import { findPossibleDuplicates, isAdditionalContactRelationship } from '@/lib/project-homeowners'

const uuid = z.uuid()
const MISSING_TABLE = new Set(['42P01', 'PGRST205'])
const NOT_RELATIONSHIP =
  'Choose Spouse, Partner, Co-owner, Trustee, Authorized representative, Family member, or Other. Add agents, attorneys, and property managers as business contacts.'

type Supabase = Awaited<ReturnType<typeof createClient>>

async function primaryClientFor(supabase: Supabase, organizationId: string, projectId: string) {
  const { data } = await supabase
    .from('project_clients')
    .select('client_id, relationship')
    .eq('project_id', projectId)
    .eq('organization_id', organizationId)
    .order('created_at')
  const rows = (data ?? []) as { client_id: string; relationship: string }[]
  return (rows.find((r) => r.relationship === 'primary_owner') ?? rows[0])?.client_id ?? null
}

function revalidate(projectId: string, clientId: string) {
  revalidatePath(`/projects/${projectId}`)
  revalidatePath(`/clients/${clientId}`)
}

/**
 * Creates a person on the project's existing primary homeowner (client_contacts) — never a new
 * clients row, never a portal account or permission. Optionally scopes the person to this project only.
 */
export async function addProjectAdditionalContactAction(
  projectId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = formValues(formData)
  const session = await requireManager()
  if (!uuid.safeParse(projectId).success) return { error: 'Invalid project.', values }

  const parsed = contactSchema.safeParse({
    ...values,
    portal_enabled: false,
    portal_view_reports: false,
    portal_validate_issues: false,
    portal_acknowledge: false,
    portal_sign: false,
  })
  if (!parsed.success) return { ...fromZodError(parsed.error), values }
  if (!isAdditionalContactRelationship(parsed.data.relationship)) {
    return { error: NOT_RELATIONSHIP, fieldErrors: { relationship: NOT_RELATIONSHIP }, values }
  }

  const supabase = await createClient()
  const clientId = await primaryClientFor(supabase, session.organizationId, projectId)
  if (!clientId) return { error: 'This project has no homeowner to add a contact to.', values }

  if (values.confirm_new !== 'true') {
    const { data: existing } = await supabase
      .from('client_contacts')
      .select('id, first_name, last_name, email, phone, alternate_phone')
      .eq('client_id', clientId)
      .eq('organization_id', session.organizationId)
    const matches = findPossibleDuplicates(parsed.data, existing ?? [])
    if (matches.length) {
      const names = matches.map((m) => `${m.contact.first_name} ${m.contact.last_name}`).join(', ')
      return {
        error: `Possible duplicate of ${names}. Reuse the existing contact, or confirm this is a different person.`,
        fieldErrors: { _duplicate: 'true' },
        values,
      }
    }
  }

  const projectOnly = values.project_only === 'on' || values.project_only === 'true'
  if (projectOnly) {
    const probe = await supabase.from('client_contact_projects').select('id').limit(1)
    if (probe.error && MISSING_TABLE.has(probe.error.code)) {
      return { error: 'Project-only contacts are not enabled yet. Uncheck "This project only" to continue.', values }
    }
  }

  const { data: inserted, error } = await supabase
    .from('client_contacts')
    .insert({
      ...parsed.data,
      is_primary: false,
      client_id: clientId,
      organization_id: session.organizationId,
      created_by: session.userId,
    })
    .select('id')
    .single()
  if (error || !inserted) return { error: friendlyDbError(error), values }

  if (projectOnly) {
    const { error: scopeError } = await supabase.from('client_contact_projects').insert({
      organization_id: session.organizationId,
      contact_id: inserted.id,
      project_id: projectId,
      created_by: session.userId,
    })
    if (scopeError) {
      await supabase.from('client_contacts').delete().eq('id', inserted.id).eq('organization_id', session.organizationId)
      return { error: friendlyDbError(scopeError), values }
    }
  }

  revalidate(projectId, clientId)
  return { success: `${parsed.data.first_name} ${parsed.data.last_name} added. Portal access: Not provisioned.`, savedId: inserted.id }
}

/** Shows an existing homeowner contact on this project instead of creating a duplicate person. */
export async function reuseContactOnProjectAction(projectId: string, contactId: string): Promise<ActionState> {
  const session = await requireManager()
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(contactId).success) return { error: 'Invalid contact.' }

  const supabase = await createClient()
  const clientId = await primaryClientFor(supabase, session.organizationId, projectId)
  const { data: contact } = await supabase
    .from('client_contacts')
    .select('id, client_id, archived_at')
    .eq('id', contactId)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!contact || contact.client_id !== clientId) return { error: 'That contact does not belong to this homeowner.' }
  if (contact.archived_at) return { error: 'That contact is archived. Restore it from Manage contacts first.' }

  const { data: scopes, error } = await supabase
    .from('client_contact_projects')
    .select('project_id')
    .eq('contact_id', contactId)
  if (error) return { error: MISSING_TABLE.has(error.code) ? 'That contact is already shown on this project.' : friendlyDbError(error) }
  const projectIds = (scopes ?? []).map((s: { project_id: string }) => s.project_id)
  if (projectIds.length === 0 || projectIds.includes(projectId)) return { success: 'That contact is already shown on this project.' }

  const { error: insertError } = await supabase.from('client_contact_projects').insert({
    organization_id: session.organizationId,
    contact_id: contactId,
    project_id: projectId,
    created_by: session.userId,
  })
  if (insertError) return { error: friendlyDbError(insertError) }

  revalidate(projectId, contact.client_id)
  return { success: 'Existing contact added to this project.' }
}
