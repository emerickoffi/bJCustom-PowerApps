import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { SupportEvent, SupportGrant, SupportSection } from '@/lib/support-access-shared'

export type SupportProjectOption = { id: string; name: string; project_number: string | null }

export type CompanySupportAccess = {
  /** False until the support access migration has been applied. */
  available: boolean
  grants: SupportGrant[]
  events: SupportEvent[]
  projects: SupportProjectOption[]
}

/** Everything the company admin's Support access page shows. RLS limits it to the admin's own company. */
export async function loadCompanySupportAccess(organizationId: string): Promise<CompanySupportAccess> {
  const supabase = await createClient()
  const [grants, events, projects] = await Promise.all([
    supabase
      .from('support_access_grants')
      .select('id, project_id, ticket_reference, reason, access_level, granted_at, expires_at, revoked_at')
      .eq('organization_id', organizationId)
      .order('granted_at', { ascending: false })
      .limit(50),
    supabase
      .from('support_access_events')
      .select('id, grant_id, actor_kind, actor_name, actor_email, action, section, created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('projects')
      .select('id, name, project_number, archived_at')
      .eq('organization_id', organizationId)
      .order('name'),
  ])

  if (grants.error || events.error) return { available: false, grants: [], events: [], projects: [] }

  const allProjects = (projects.data ?? []) as (SupportProjectOption & { archived_at: string | null })[]
  const byId = new Map(allProjects.map((p) => [p.id, p]))
  const eventRows = (events.data ?? []) as SupportEvent[]
  const grantedBy = new Map<string, string>()
  for (const e of eventRows) {
    if (e.action === 'granted' && e.grant_id) grantedBy.set(e.grant_id, e.actor_name || e.actor_email || 'A company admin')
  }

  return {
    available: true,
    grants: (grants.data ?? []).map((g) => ({
      ...(g as Omit<SupportGrant, 'project_name' | 'project_number' | 'granted_by_name'>),
      project_name: byId.get(g.project_id)?.name ?? 'Project',
      project_number: byId.get(g.project_id)?.project_number ?? null,
      granted_by_name: grantedBy.get(g.id) ?? null,
    })),
    events: eventRows,
    projects: allProjects.filter((p) => !p.archived_at).map(({ id, name, project_number }) => ({ id, name, project_number })),
  }
}

// ───────── Trefort support side ─────────

export type PlatformSupportGrant = {
  id: string
  organization_id: string
  organization_name: string
  project_id: string
  project_name: string
  project_number: string | null
  ticket_reference: string
  reason: string | null
  granted_by_name: string | null
  granted_by_email: string | null
  granted_at: string
  expires_at: string
}

/** Grants that are open right now, for every company. Null if the migration is missing or the call failed. */
export async function loadPlatformSupportGrants(): Promise<PlatformSupportGrant[] | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_support_grants')
  return error ? null : ((data ?? []) as PlatformSupportGrant[])
}

export type SupportView = {
  grant: {
    id: string
    ticket_reference: string
    reason: string | null
    granted_at: string
    expires_at: string
    access_level: 'read_only'
    organization_name: string
  }
  project: Record<string, unknown> & { id: string; name: string; project_number: string | null }
  section: SupportSection
  rows: Record<string, unknown>[]
}

/**
 * Opens one section of a granted project. The database checks the grant (expiry, revocation, project) and
 * logs the view on every call, so each page load here is one entry in the company's access log.
 */
export async function loadSupportView(
  grantId: string,
  section: SupportSection,
): Promise<{ view: SupportView } | { error: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_support_view', { p_grant: grantId, p_section: section })
  if (error || !data) return { error: error?.message ?? 'This support access is not available.' }
  return { view: data as SupportView }
}

// ───────── Help requests (owner console) ─────────

export type PlatformHelpRequest = {
  id: string
  reference: string
  status: 'open' | 'closed'
  area: 'staff' | 'portal' | 'sub' | 'public'
  subject: string
  message: string
  requester_name: string | null
  requester_email: string
  requester_role: string | null
  page_path: string | null
  user_agent: string | null
  last_error: string | null
  context: { browser?: string | null } | null
  email_status: 'pending' | 'sent' | 'failed' | 'not_configured'
  created_at: string
  closed_at: string | null
  closed_by_email: string | null
  organization_id: string | null
  organization_name: string | null
  project_id: string | null
  project_name: string | null
  project_number: string | null
  support_access_grant_id: string | null
  support_access_open: boolean
}

/** Null when the help requests migration has not been applied or the call failed. */
export async function loadPlatformHelpRequests(status: 'open' | 'closed' | 'all'): Promise<PlatformHelpRequest[] | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_list_support_tickets', { p_status: status, p_limit: 150 })
  return error ? null : ((data ?? []) as PlatformHelpRequest[])
}
