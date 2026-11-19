import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { buildChecklist, type Checklist } from '@/lib/getting-started-shared'

/** New companies get default module switches at signup; only a change made after that counts as reviewed. */
function modulesChangedAfterSignup(createdAt: string | null, rows: { updated_at: string | null }[]): boolean {
  const created = createdAt ? Date.parse(createdAt) : 0
  return rows.some((r) => r.updated_at && Date.parse(r.updated_at) - created > 5 * 60_000)
}

/**
 * Loads the Getting started checklist for a company administrator.
 * Returns null when it should not show (internal companies, or before the sample-project migration runs).
 */
export async function getGettingStarted(organizationId: string): Promise<Checklist | null> {
  const supabase = await createClient()
  const [org, settings, sampleLive, sampleAny, real, features, members, invites] = await Promise.all([
    supabase.from('organizations').select('logo_url, phone, email, plan_key, stripe_subscription_id, created_at').eq('id', organizationId).maybeSingle(),
    supabase.from('organization_settings').select('getting_started_dismissed_at').eq('organization_id', organizationId).maybeSingle(),
    supabase.from('projects').select('id').eq('organization_id', organizationId).eq('is_sample', true).is('archived_at', null).limit(1).maybeSingle(),
    supabase.from('projects').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('is_sample', true),
    supabase.from('projects').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('is_sample', false),
    supabase.from('organization_features').select('updated_at').eq('organization_id', organizationId),
    supabase
      .from('organization_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .neq('role', 'client'),
    supabase
      .from('invitations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'pending')
      .neq('role', 'client')
      .gt('expires_at', new Date().toISOString()),
  ])

  // Missing columns mean the migration has not run yet; show nothing rather than a broken card.
  if (org.error || !org.data || settings.error || sampleLive.error || sampleAny.error) return null
  if (org.data.plan_key === 'internal') return null

  return buildChecklist({
    sampleProjectId: sampleLive.data?.id ?? null,
    sampleEverLoaded: (sampleAny.count ?? 0) > 0,
    hasLogo: Boolean(org.data.logo_url),
    hasContactDetails: Boolean(org.data.phone || org.data.email),
    reviewedModules: modulesChangedAfterSignup(org.data.created_at, features.data ?? []),
    realProjectCount: real.count ?? 0,
    staffMemberCount: members.count ?? 1,
    pendingStaffInvites: invites.count ?? 0,
    hasSubscription: Boolean(org.data.stripe_subscription_id),
    dismissed: Boolean(settings.data?.getting_started_dismissed_at),
  })
}
