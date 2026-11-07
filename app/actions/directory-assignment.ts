'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { canManage, getSession } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { friendlyDbError } from '@/lib/action-state'
import { projectAcceptsNewAssignments } from '@/lib/domain'
import { personName } from '@/lib/contacts'
import { isUuid } from '@/lib/subcontractor-projects'
import {
  EMAIL_DELIVERY,
  bulkAssignSchema,
  classifyInsertError,
  emailEligibility,
  itemKey,
  resolveNotification,
  type BulkAssignResult,
  type PersonAssignItem,
} from '@/lib/directory-assignment'

export type BulkAssignResponse = { ok: true; results: BulkAssignResult[] } | { ok: false; error: string }

const CONCURRENCY = 8

async function inChunks<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += CONCURRENCY) out.push(...(await Promise.all(items.slice(i, i + CONCURRENCY).map(fn))))
  return out
}

/**
 * Assigns directory people and companies to one project. Each record is handled independently so one failure never
 * blocks the rest. It only creates project memberships: no accounts, invitations, or permissions are granted here.
 */
export async function bulkAssignFromDirectoryAction(projectId: string, input: unknown): Promise<BulkAssignResponse> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'Your session has expired. Please sign in again.' }
  if (!session.organizationId || !session.role || session.role === 'client') {
    return { ok: false, error: 'Your account is not associated with an active construction company.' }
  }
  if (!canManage(session.role)) return { ok: false, error: 'Your role does not allow you to assign contacts to projects.' }
  if (!isUuid(projectId)) return { ok: false, error: 'This project could not be found.' }

  const parsed = bulkAssignSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'The selection is not valid.' }
  const items = parsed.data
  const orgId = session.organizationId
  const supabase = await createClient()

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, status, archived_at')
    .eq('organization_id', orgId)
    .eq('id', projectId)
    .maybeSingle()
  if (projectError) return { ok: false, error: friendlyDbError(projectError) }
  if (!project) return { ok: false, error: 'This project could not be found.' }
  if (project.archived_at || !projectAcceptsNewAssignments(project.status as string)) {
    return { ok: false, error: 'This project is closed to new assignments.' }
  }

  const personItems = items.filter((i): i is PersonAssignItem => i.kind === 'person')
  const companyItems = items.filter((i) => i.kind === 'company')
  const results: BulkAssignResult[] = []

  if (personItems.length) {
    const ids = personItems.map((i) => i.id)
    const relIds = personItems.map((i) => i.person_company_id).filter((v): v is string => !!v)
    const [peopleRes, relRes, existingRes] = await Promise.all([
      supabase.from('business_people').select('id, first_name, last_name, email, status').eq('organization_id', orgId).in('id', ids),
      relIds.length
        ? supabase.from('business_person_companies').select('id, person_id, status').eq('organization_id', orgId).in('id', relIds)
        : Promise.resolve({ data: [] as { id: string; person_id: string; status: string }[], error: null }),
      supabase.from('business_person_projects').select('person_id').eq('organization_id', orgId).eq('project_id', projectId).eq('status', 'active').in('person_id', ids),
    ])
    const lookupError = peopleRes.error ?? relRes.error ?? existingRes.error
    if (lookupError) return { ok: false, error: friendlyDbError(lookupError) }

    const people = new Map((peopleRes.data ?? []).map((p) => [p.id as string, p]))
    const rels = new Map((relRes.data ?? []).map((r) => [r.id as string, r]))
    const existing = new Set((existingRes.data ?? []).map((r) => r.person_id as string))

    results.push(
      ...(await inChunks(personItems, async (item): Promise<BulkAssignResult> => {
        const person = people.get(item.id)
        const base = { key: itemKey('person', item.id), kind: 'person' as const, id: item.id }
        const finish = (outcome: BulkAssignResult['outcome'], reason?: string): BulkAssignResult => ({
          ...base,
          name: person ? personName(person as { first_name: string; last_name: string }) : 'Unknown contact',
          outcome,
          reason,
          ...resolveNotification(item.notify, outcome, emailEligibility(person?.email as string | null, EMAIL_DELIVERY)),
        })
        if (!person) return finish('failed', 'This contact was not found in your directory.')
        if (person.status === 'inactive') return finish('failed', 'Inactive contacts cannot be assigned. Reactivate the contact first.')
        if (item.person_company_id) {
          const rel = rels.get(item.person_company_id)
          if (!rel || rel.person_id !== item.id || rel.status !== 'active') {
            return finish('failed', 'The selected company affiliation is no longer current for this contact.')
          }
        }
        if (existing.has(item.id)) return finish('already_assigned', 'Already assigned to this project.')
        const { error } = await supabase.from('business_person_projects').insert({
          organization_id: orgId,
          person_id: item.id,
          project_id: projectId,
          person_company_id: item.person_company_id,
          project_role: item.project_role,
          status: 'active',
        })
        const c = classifyInsertError(error)
        return finish(c.outcome, c.reason)
      })),
    )
  }

  if (companyItems.length) {
    const ids = companyItems.map((i) => i.id)
    const features = await getOrgFeatures(orgId)
    const { data: companies, error: companyError } = await supabase
      .from('business_companies')
      .select('id, company_name, status, subcontractor_company_id')
      .eq('organization_id', orgId)
      .in('id', ids)
    if (companyError) return { ok: false, error: friendlyDbError(companyError) }
    const byId = new Map((companies ?? []).map((c) => [c.id as string, c]))
    const subIds = (companies ?? []).map((c) => c.subcontractor_company_id as string | null).filter((v): v is string => !!v)
    const existingSubs = new Set<string>()
    if (subIds.length && features.subcontractors) {
      const { data } = await supabase
        .from('subcontractor_project_assignments')
        .select('subcontractor_company_id')
        .eq('organization_id', orgId)
        .eq('project_id', projectId)
        .is('ended_at', null)
        .in('subcontractor_company_id', subIds)
      for (const r of data ?? []) existingSubs.add(r.subcontractor_company_id as string)
    }

    results.push(
      ...(await inChunks(companyItems, async (item): Promise<BulkAssignResult> => {
        const company = byId.get(item.id)
        const finish = (outcome: BulkAssignResult['outcome'], reason?: string): BulkAssignResult => ({
          key: itemKey('company', item.id),
          kind: 'company',
          id: item.id,
          name: (company?.company_name as string) ?? 'Unknown company',
          outcome,
          reason,
          notification: 'not_requested',
        })
        if (!company) return finish('failed', 'This company was not found in your directory.')
        if (company.status === 'inactive') return finish('failed', 'Inactive companies cannot be assigned.')
        const subId = company.subcontractor_company_id as string | null
        if (!subId) return finish('failed', 'Only subcontractor companies can be assigned. Assign its people individually.')
        if (!features.subcontractors) return finish('failed', 'Subcontractor management is not turned on for your company.')
        if (existingSubs.has(subId)) return finish('already_assigned', 'Already assigned to this project.')
        const { error } = await supabase
          .from('subcontractor_project_assignments')
          .insert({ organization_id: orgId, project_id: projectId, subcontractor_company_id: subId })
        const c = classifyInsertError(error)
        return finish(c.outcome, c.reason)
      })),
    )
  }

  if (results.some((r) => r.outcome === 'added')) {
    revalidatePath(`/projects/${projectId}/contacts`)
    revalidatePath(`/projects/${projectId}`)
    revalidatePath('/contacts')
  }

  const order = new Map(items.map((i, idx) => [itemKey(i.kind, i.id), idx]))
  results.sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0))
  return { ok: true, results }
}
