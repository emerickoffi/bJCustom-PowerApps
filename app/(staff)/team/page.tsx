import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { InviteStaffForm, InvitationList, MemberList, type InvitationRow, type MemberRow } from '@/components/team/team-panels'
import type { OrgRole } from '@/lib/domain'
import { UsersRound as UsersRoundIcon } from 'lucide-react'
import { TeamActionDrawer } from '@/components/team/team-action-drawer'
import {
  CreateStaffAccountForm,
  PendingActivationList,
  type PendingActivation,
  type ProjectOption,
} from '@/components/team/create-staff-account'

export const metadata: Metadata = { title: 'Team' }

export default async function TeamPage() {
  const session = await requireAdmin()
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
      .select('id, email, role, created_at, expires_at')
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
  const projectOptions: ProjectOption[] = (projectsRes.data ?? []).map((p) => ({
    id: p.id,
    label: [p.project_number && `#${p.project_number}`, p.name].filter(Boolean).join(' '),
  }))

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={UsersRoundIcon}
        tone="sage"
        title="Team"
        description="Invite builder staff and control what they can access. Homeowner access is managed from each client record."
        actions={
          <>
            <TeamActionDrawer
              kind="invite"
              variant="outline"
              label="Invite by email"
              title="Invite staff by email"
              description="Send an invitation link. The person sets their own password when they accept."
            >
              <InviteStaffForm />
            </TeamActionDrawer>
            <TeamActionDrawer
              kind="create"
              label="Create staff account"
              title="Create staff account"
              description="Creates a login directly, with no email needed. You hand over a one-time temporary password, so copy it before closing this panel."
            >
              <CreateStaffAccountForm projects={projectOptions} />
            </TeamActionDrawer>
          </>
        }
      />
      <div className="flex flex-col gap-8">
        <MemberList members={members} />
        <PendingActivationList accounts={pending} />
        <InvitationList invitations={(invitesRes.data ?? []) as InvitationRow[]} />
      </div>
    </div>
  )
}
