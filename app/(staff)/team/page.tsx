import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { PageHeader, pageLayout } from '@/components/shared/page-header'
import { MemberList, type MemberRow } from '@/components/team/team-panels'
import { InviteStaffForm, InvitationList, type InvitationRow, type ProjectOption } from '@/components/team/staff-invitations'
import type { OrgRole } from '@/lib/domain'
import { UsersRound as UsersRoundIcon } from 'lucide-react'
import { TeamActionDrawer } from '@/components/team/team-action-drawer'
import { PendingActivationList, type PendingActivation } from '@/components/team/create-staff-account'
import { UsersAccessTabs } from '@/components/team/users-access-tabs'
import { HomeownerAccountList, type HomeownerFilter } from '@/components/team/homeowner-account-list'
import { loadHomeownerAccounts } from '@/lib/homeowner-accounts'
import { getOrgFeatures } from '@/lib/features'
import { sanitizeSearch } from '@/lib/format'

function UsersAccessHeader({ actions }: { actions?: React.ReactNode }) {
  return (
    <PageHeader
      icon={UsersRoundIcon}
      title="Users & Access"
      actions={actions}
    />
  )
}

export const metadata: Metadata = { title: 'Users & Access' }

type Tab = 'staff' | 'homeowners'

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; account?: string }>
}) {
  const session = await requireAdmin()
  const params = await searchParams
  const tab: Tab = params.tab === 'homeowners' ? 'homeowners' : 'staff'

  if (tab === 'homeowners') {
    const q = sanitizeSearch(params.q)
    const filter: HomeownerFilter =
      params.account === 'with_account' || params.account === 'without_account' ? params.account : 'all'
    const [{ rows, truncated }, features] = await Promise.all([
      loadHomeownerAccounts(session.organizationId, q),
      getOrgFeatures(session.organizationId),
    ])
    return (
      <div className="flex flex-col gap-8">
        <UsersAccessHeader />
        <UsersAccessTabs active="homeowners" />
        <HomeownerAccountList rows={rows} filter={filter} q={q} truncated={truncated} portalEnabled={features.portal} />
      </div>
    )
  }

  const supabase = await createClient()

  const [membersRes, invitesRes, projectsRes] = await Promise.all([
    supabase
      .from('organization_memberships')
      .select('id, user_id, role, status, created_at, activation_required')
      .eq('organization_id', session.organizationId)
      .neq('role', 'client')
      .order('created_at'),
    supabase
      .from('invitations')
      .select('id, email, role, created_at, expires_at, project_ids, token_hash')
      .eq('organization_id', session.organizationId)
      .eq('status', 'pending')
      .neq('role', 'client')
      .order('created_at', { ascending: false }),
    supabase
      .from('projects')
      .select('id, name, project_number')
      .eq('organization_id', session.organizationId)
      .is('archived_at', null)
      .order('created_at', { ascending: false }),
  ])

  const memberships = membersRes.data ?? []
  const { data: profiles } = memberships.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', memberships.map((m) => m.user_id))
    : { data: [] }
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]))

  const members: MemberRow[] = memberships.map((m) => ({
    id: m.id,
    role: m.role as OrgRole,
    status: m.status as 'active' | 'suspended',
    name: byId.get(m.user_id)?.full_name ?? null,
    email: byId.get(m.user_id)?.email ?? null,
    isSelf: m.user_id === session.userId,
  }))

  const pending: PendingActivation[] = memberships
    .filter((m) => m.activation_required)
    .map((m) => ({
      membershipId: m.id,
      name: byId.get(m.user_id)?.full_name ?? byId.get(m.user_id)?.email ?? 'Staff member',
      email: byId.get(m.user_id)?.email ?? null,
    }))
  const invitations: InvitationRow[] = (invitesRes.data ?? []).map((inv) => ({
    id: inv.id,
    email: inv.email,
    role: inv.role as OrgRole,
    created_at: inv.created_at,
    expires_at: inv.expires_at,
    project_count: (inv.project_ids as string[] | null)?.length ?? 0,
    has_link: Boolean(inv.token_hash),
  }))
  const projectOptions: ProjectOption[] = (projectsRes.data ?? []).map((p) => ({
    id: p.id,
    label: [p.project_number && `#${p.project_number}`, p.name].filter(Boolean).join(' '),
  }))

  return (
    <div className={pageLayout('workspace')}>
      <UsersAccessHeader
        actions={
          <>
            <TeamActionDrawer
              kind="invite"
              label="Invite staff"
              title="Invite staff"
              description="Creates a one-time invitation link for a specific email address. The person signs up or signs in with that email and chooses their own password."
            >
              <InviteStaffForm projects={projectOptions} />
            </TeamActionDrawer>
          </>
        }
      />
      <UsersAccessTabs active="staff" />
      <div className="flex flex-col gap-8">
        <MemberList members={members} />
        <PendingActivationList accounts={pending} />
        <InvitationList invitations={invitations} />
      </div>
    </div>
  )
}
