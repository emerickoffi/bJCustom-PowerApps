import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import type { StaffSession } from '@/lib/session'
import { personName } from '@/lib/contacts'
import { contactFieldKey, planCurrentContactChanges, type ParsedContactPerson } from '@/lib/subcontractor-contact-persons'

type Supabase = Awaited<ReturnType<typeof createClient>>

/**
 * Read-only checks run before anything is written, so the most common problems (an email already in the directory,
 * a stale person selection) come back as field errors and nothing is saved.
 */
export async function precheckContactPersons(
  supabase: Supabase,
  organizationId: string,
  items: ParsedContactPerson[],
): Promise<Record<string, string> | { error: string } | null> {
  const fieldErrors: Record<string, string> = {}
  const emails = items.flatMap((i) => (i.kind === 'new' && i.person.email ? [i.person.email] : []))
  if (emails.length) {
    const { data, error } = await supabase
      .from('business_people')
      .select('email, first_name, last_name')
      .eq('organization_id', organizationId)
      .in('email', emails)
    if (error) return { error: 'Contact persons could not be checked, so nothing was saved. Please try again.' }
    const taken = new Map((data ?? []).map((p) => [String(p.email).toLowerCase(), personName(p)]))
    for (const item of items) {
      if (item.kind !== 'new' || !item.person.email) continue
      const owner = taken.get(item.person.email)
      if (owner) {
        fieldErrors[contactFieldKey(item.key, 'email')] =
          `${owner} already uses this email in Contacts. Use "Select existing" to link them instead.`
      }
    }
  }
  const existingIds = items.flatMap((i) => (i.kind === 'existing' ? [i.person_id] : []))
  if (existingIds.length) {
    const { data, error } = await supabase
      .from('business_people')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .in('id', existingIds)
    if (error) return { error: 'Contact persons could not be checked, so nothing was saved. Please try again.' }
    if ((data ?? []).length !== new Set(existingIds).size) {
      return { error: 'One of the selected contacts is no longer available. Remove it and select again.' }
    }
  }
  return Object.keys(fieldErrors).length ? fieldErrors : null
}

/**
 * Applies the Contact Persons section to the Contacts company linked to a subcontractor. Writes are ordered so the
 * one-primary-per-company rule holds at every step; ended relationships are kept as history, never deleted.
 * Returns a human-readable problem when any part did not save, so the caller can report exactly what happened.
 */
export async function saveContactPersons(
  supabase: Supabase,
  session: StaffSession,
  subcontractorId: string,
  items: ParsedContactPerson[],
): Promise<{ problem: string | null; personIds: string[] }> {
  if (!items.length) return { problem: null, personIds: [] }
  const orgId = session.organizationId
  const { data: company, error: companyError } = await supabase
    .from('business_companies')
    .select('id')
    .eq('organization_id', orgId)
    .eq('subcontractor_company_id', subcontractorId)
    .maybeSingle()
  if (companyError || !company) {
    return {
      problem: 'This company is not linked in Contacts yet, so contact persons were not saved. Link it from Contacts, then add people.',
      personIds: [],
    }
  }

  const { data: currentRows, error: currentError } = await supabase
    .from('business_person_companies')
    .select('id, person_id, position_or_role, is_primary_contact')
    .eq('organization_id', orgId)
    .eq('company_id', company.id)
    .eq('status', 'active')
  if (currentError) return { problem: 'Contact persons could not be saved. Open the subcontractor again to retry.', personIds: [] }
  const current = (currentRows ?? []).map((r) => ({
    relationship_id: r.id as string,
    person_id: r.person_id as string,
    role: (r.position_or_role as string | null) ?? null,
    is_primary: Boolean(r.is_primary_contact),
  }))
  const activePeople = new Set(current.map((c) => c.person_id))
  const plan = planCurrentContactChanges(
    current,
    items.filter((i): i is Extract<ParsedContactPerson, { kind: 'current' }> => i.kind === 'current'),
  )
  const problems: string[] = []
  const personIds: string[] = []
  const today = new Date().toISOString().slice(0, 10)

  if (plan.end.length) {
    const { error } = await supabase
      .from('business_person_companies')
      .update({ status: 'ended', ended_at: today, ended_by: session.userId, is_primary_contact: false, updated_by: session.userId })
      .eq('organization_id', orgId)
      .eq('company_id', company.id)
      .eq('status', 'active')
      .in('id', plan.end)
    if (error) problems.push('removed people could not be ended')
  }

  // A new or newly selected primary needs any other active primary cleared first.
  const incomingPrimary = items.some((i) => (i.kind === 'existing' || i.kind === 'new') && i.is_primary)
  const updates = incomingPrimary
    ? [
        ...current
          .filter((c) => c.is_primary && !plan.end.includes(c.relationship_id) && !plan.update.some((u) => u.relationship_id === c.relationship_id))
          .map((c) => ({ relationship_id: c.relationship_id, role: c.role, is_primary: false })),
        ...plan.update,
      ]
    : plan.update
  for (const u of updates) {
    const { error } = await supabase
      .from('business_person_companies')
      .update({ position_or_role: u.role, is_primary_contact: u.is_primary, updated_by: session.userId })
      .eq('organization_id', orgId)
      .eq('id', u.relationship_id)
      .eq('status', 'active')
    if (error) problems.push(error.code === '23505' ? 'the primary contact could not be changed' : 'a role change could not be saved')
  }

  const links: { person_id: string; role: string | null; is_primary: boolean }[] = []
  for (const item of items) {
    if (item.kind === 'existing') {
      if (!activePeople.has(item.person_id)) links.push({ person_id: item.person_id, role: item.role, is_primary: item.is_primary })
      continue
    }
    if (item.kind !== 'new') continue
    const { data: created, error } = await supabase
      .from('business_people')
      .insert({ ...item.person, organization_id: orgId, created_by: session.userId, updated_by: session.userId })
      .select('id')
      .single()
    if (error || !created) {
      problems.push(
        error?.code === '23505'
          ? `${personName(item.person)} was not added because another contact already uses that email`
          : `${personName(item.person)} could not be added`,
      )
      continue
    }
    personIds.push(created.id as string)
    links.push({ person_id: created.id as string, role: item.role, is_primary: item.is_primary })
  }

  if (links.length) {
    const { error } = await supabase.from('business_person_companies').insert(
      links.map((l) => ({
        organization_id: orgId,
        person_id: l.person_id,
        company_id: company.id,
        position_or_role: l.role,
        is_primary_contact: l.is_primary,
        created_by: session.userId,
        updated_by: session.userId,
      })),
    )
    if (error) {
      problems.push(
        error.code === '23505'
          ? 'the selected people were not linked because one is already linked or another primary contact exists'
          : 'the selected people could not be linked to this company',
      )
    } else {
      personIds.push(...links.map((l) => l.person_id))
    }
  }

  return {
    problem: problems.length ? `Some contact person changes did not save: ${problems.join('; ')}. Open the subcontractor again to retry.` : null,
    personIds: [...new Set(personIds)],
  }
}
