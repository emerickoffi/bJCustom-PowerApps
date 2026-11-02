import 'server-only'
import type { createClient } from '@/lib/supabase/server'

type Supabase = Awaited<ReturnType<typeof createClient>>

export type AssignmentResult = { ok: true } | { ok: false; error: string; conflict?: boolean }

/**
 * The single path for setting a project's primary homeowner. Database triggers on
 * `projects.primary_client_id` maintain the `project_clients` link and client activity;
 * nothing here sends invitations, grants portal access, or touches status, schedule, or money.
 */

/** Returns an error message when the client cannot be linked to a project in this organization. */
export async function checkAssignableClient(supabase: Supabase, organizationId: string, clientId: string): Promise<string | null> {
  const { data } = await supabase
    .from('clients')
    .select('id, status')
    .eq('id', clientId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (!data) return 'That client is not available. Choose another client.'
  if (data.status === 'archived') return 'That client is archived. Restore them from the client directory first.'
  return null
}

/** Returns an error message unless the project exists in this organization and has no primary homeowner. */
/** Active projects with no primary homeowner, for the "Assign to project" picker on new clients. */
export async function getUnassignedProjectOptions(supabase: Supabase, organizationId: string) {
  const { data } = await supabase
    .from('projects')
    .select('id, name')
    .eq('organization_id', organizationId)
    .is('primary_client_id', null)
    .order('created_at', { ascending: false })
    .limit(200)
  return (data ?? []).map((p) => ({ value: p.id as string, label: (p.name as string) || 'Untitled project' }))
}

export async function checkUnassignedProject(supabase: Supabase, organizationId: string, projectId: string): Promise<string | null> {
  const { data } = await supabase
    .from('projects')
    .select('id, primary_client_id')
    .eq('id', projectId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (!data) return 'That project is not available. Choose another project.'
  if (data.primary_client_id) return 'That project already has a primary homeowner. Change it from the project page instead.'
  return null
}

/**
 * Sets (or clears, with `clientId: null`) the primary homeowner, but only if the project still
 * has `expectedClientId`. A concurrent change makes the update match no rows, which is reported
 * as a conflict instead of silently replacing someone else's assignment.
 */
export async function assignPrimaryClient(
  supabase: Supabase,
  input: { organizationId: string; userId: string; projectId: string; clientId: string | null; expectedClientId: string | null },
): Promise<AssignmentResult> {
  const { organizationId, userId, projectId, clientId, expectedClientId } = input
  if (clientId === expectedClientId) return { ok: true }

  if (clientId) {
    const clientError = await checkAssignableClient(supabase, organizationId, clientId)
    if (clientError) return { ok: false, error: clientError }
  }

  let query = supabase
    .from('projects')
    .update({ primary_client_id: clientId, updated_by: userId })
    .eq('id', projectId)
    .eq('organization_id', organizationId)
  query = expectedClientId ? query.eq('primary_client_id', expectedClientId) : query.is('primary_client_id', null)
  const { data, error } = await query.select('id')

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[project-client] assignment failed', { code: error.code, message: error.message })
    }
    return {
      ok: false,
      error: error.code === '42501' ? 'You do not have permission to change this project.' : 'The homeowner could not be saved. Please try again.',
    }
  }
  if (!data?.length) {
    const { data: exists } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('organization_id', organizationId)
      .maybeSingle()
    if (!exists) return { ok: false, error: 'Project not found.' }
    return {
      ok: false,
      conflict: true,
      error: 'Someone else changed this project’s homeowner while you were editing. Review the current homeowner and try again.',
    }
  }
  return { ok: true }
}
