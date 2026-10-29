import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requireStaff, canManage } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { getProfileNames, PROJECT_SUMMARY_COLUMNS } from '@/lib/queries'
import { BackLink } from '@/components/shared/page-header'
import { ClientInformationCard } from '@/components/clients/client-information-card'
import { ClientStatusBadge } from '@/components/shared/status-badge'
import { ProjectList, type ProjectListItem, type WarrantyMilestone } from '@/components/projects/project-list'
import {
  ActivityPanel,
  ContactsPanel,
  PortalAccessPanel,
  type ActivityRow,
  type ContactRow,
  type PortalAccountStatus,
} from '@/components/clients/client-panels'
import { getOrgFeatures } from '@/lib/features'
import {
  ManagePortalAccessPanel,
  type PortalAccountRow,
  type PortalContactOption,
} from '@/components/clients/manage-portal-access'
import { COMMUNICATION_LABELS, type ClientStatus, type CommunicationMethod } from '@/lib/domain'
import { formatAddress, formatDate } from '@/lib/format'

export const metadata: Metadata = { title: 'Client' }

type ContactLite = { id: string; first_name: string; last_name: string; email: string | null; is_primary: boolean }

async function loadPortalAccess(
  client: { id: string; first_name: string; last_name: string; email: string | null },
  contacts: ContactLite[],
  projects: { id: string; name?: string; project_number?: string }[],
) {
  const supabase = await createClient()
  const { data: accounts } = await supabase
    .from('portal_accounts')
    .select('id, user_id, contact_id, portal_project_access(project_id)')
    .eq('client_id', client.id)
    .order('created_at')
  const userIds = (accounts ?? []).map((a) => a.user_id as string)
  const [profilesRes, membershipsRes] = userIds.length
    ? await Promise.all([
        supabase.from('profiles').select('id, full_name, email').in('id', userIds),
        supabase.from('organization_memberships').select('user_id, status, activation_required').in('user_id', userIds),
      ])
    : [{ data: [] }, { data: [] }]
  const profileById = new Map((profilesRes.data ?? []).map((p) => [p.id, p]))
  const memberById = new Map((membershipsRes.data ?? []).map((m) => [m.user_id, m]))

  // The primary client is mirrored as the is_primary client_contacts row (see client_contacts migration),
  // so only fall back to the synthetic "primary" option for clients that have no such row.
  const primaryContact = contacts.find((c) => c.is_primary)
  const contactIdsWithAccount = new Set(
    (accounts ?? []).map((a) => (a.contact_id as string | null) ?? primaryContact?.id ?? 'primary'),
  )
  // Match on the login's verified email too, so a person whose account is linked elsewhere is never offered a second one.
  const accountEmails = new Set(
    (profilesRes.data ?? []).map((p) => (p.email as string | null)?.trim().toLowerCase()).filter(Boolean) as string[],
  )
  const toOption = (value: string, name: string, isPrimary: boolean, email: string | null): PortalContactOption => {
    const normalizedEmail = email?.trim().toLowerCase()
    const hasAccount = contactIdsWithAccount.has(value) || Boolean(normalizedEmail && accountEmails.has(normalizedEmail))
    return {
      value,
      label: `${name}${isPrimary ? ' (primary)' : ''}${hasAccount ? ' — Already has access' : ''}`,
      hasEmail: Boolean(email),
      hasAccount,
    }
  }
  const contactOptions: PortalContactOption[] = [
    ...(primaryContact ? [] : [toOption('primary', `${client.first_name} ${client.last_name}`, true, client.email)]),
    ...contacts.map((c) => toOption(c.id, `${c.first_name} ${c.last_name}`, c.is_primary, c.email)),
  ]

  const statusByContact: Record<string, PortalAccountStatus | null> = {}
  for (const a of accounts ?? []) {
    if (!a.contact_id) continue
    const member = memberById.get(a.user_id)
    statusByContact[a.contact_id] = !member
      ? null
      : member.status === 'suspended'
        ? 'suspended'
        : member.activation_required
          ? 'pending'
          : member.status === 'active'
            ? 'active'
            : null
  }

  return {
    statusByContact,
    contacts: contactOptions,
    projects: projects.map((p) => ({ id: p.id, label: [p.project_number && `#${p.project_number}`, p.name].filter(Boolean).join(' ') })),
    accounts: (accounts ?? []).map((a): PortalAccountRow => {
      const profile = profileById.get(a.user_id)
      const member = memberById.get(a.user_id)
      return {
        id: a.id,
        name: profile?.full_name ?? profile?.email ?? 'Homeowner',
        email: profile?.email ?? null,
        status: (member?.status as 'active' | 'suspended') ?? 'suspended',
        activationRequired: Boolean(member?.activation_required),
        projectIds: ((a.portal_project_access as { project_id: string }[] | null) ?? []).map((x) => x.project_id),
      }
    }),
  }
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ notice?: string }>
}) {
  const session = await requireStaff()
  const { id } = await params
  const { notice } = await searchParams
  const supabase = await createClient()

  const { data: client } = await supabase
    .from('clients')
    .select(
      'id, client_number, first_name, middle_name, last_name, company_name, email, phone, alternate_phone, address_line1, address_line2, city, state, postal_code, country, preferred_communication, status, notes, portal_user_id, created_at',
    )
    .eq('id', id)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!client) notFound()

  const manager = canManage(session.role)
  const [contactsRes, activityRes, linksRes, inviteRes] = await Promise.all([
    supabase
      .from('client_contacts')
      .select(
        'id, first_name, middle_name, last_name, relationship, email, phone, alternate_phone, preferred_communication, is_primary, archived_at, portal_enabled, portal_view_reports, portal_validate_issues, portal_acknowledge, portal_sign',
      )
      .eq('client_id', id)
      .order('is_primary', { ascending: false })
      .order('created_at'),
    supabase
      .from('client_activity')
      .select('id, activity_type, summary, details, created_at, created_by')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('project_clients').select('project_id').eq('client_id', id),
    manager
      ? supabase.from('invitations').select('id').eq('client_id', id).eq('status', 'pending').limit(1)
      : Promise.resolve({ data: [] as { id: string }[] }),
  ])

  const projectIds = (linksRes.data ?? []).map((l) => l.project_id)
  const { data: projects } = projectIds.length
    ? await supabase
        .from('projects')
        .select(`${PROJECT_SUMMARY_COLUMNS}, completion_date`)
        .in('id', projectIds)
        .order('updated_at', { ascending: false })
    : { data: [] }

  const features = await getOrgFeatures(session.organizationId)
  const completedIds = (projects ?? []).filter((p) => p.status === 'completed').map((p) => p.id)
  const { data: warranties } =
    features.warranty && completedIds.length
      ? await supabase
          .from('project_warranties')
          .select('project_id, current:warranty_milestones!project_warranties_current_milestone_fk(stage_label, due_on)')
          .in('project_id', completedIds)
      : { data: [] }
  const warrantyByProject: Record<string, WarrantyMilestone | null> = Object.fromEntries(
    (warranties ?? []).map((w) => {
      const current = w.current as unknown as WarrantyMilestone | WarrantyMilestone[] | null
      return [w.project_id as string, Array.isArray(current) ? (current[0] ?? null) : current]
    }),
  )

  const names = await getProfileNames((activityRes.data ?? []).map((a) => a.created_by))
  const activity: ActivityRow[] = (activityRes.data ?? []).map((a) => ({
    ...a,
    author: a.created_by ? (names.get(a.created_by) ?? 'Team member') : 'System',
  }))

  const name = [client.first_name, client.middle_name, client.last_name].filter(Boolean).join(' ')
  const portalData = session.role === 'org_admin' ? await loadPortalAccess(client, (contactsRes.data ?? []).filter((c) => !c.archived_at), projects ?? []) : null
  const { statusByContact, ...portal } = portalData ?? { statusByContact: null }
  const portalFeatureOn = portalData ? features.portal : true
  const initials = `${client.first_name?.[0] ?? ''}${client.last_name?.[0] ?? ''}`.toUpperCase()
  const accountStatusByContact =
    statusByContact && !portalFeatureOn
      ? Object.fromEntries(Object.keys(statusByContact).map((k) => [k, 'portal_off' as const]))
      : statusByContact

  return (
    <div className="flex flex-col gap-8">
      <BackLink href="/clients" label="Clients" />

      {notice === 'created' && manager && (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium text-foreground">Client created</p>
            <p className="text-sm text-muted-foreground">
              Next, create a project for this client. Their name and mailing address will be filled in for you.
            </p>
          </div>
          <Button className="shrink-0" render={<Link href={`/projects/new?client=${client.id}`} />} nativeButton={false}>
            <Plus data-icon="inline-start" />
            Create project for this client
          </Button>
        </div>
      )}

      {notice === 'contacts_not_saved' && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          The client was created, but the additional contacts could not be saved. Please add them from the Contacts section below.
        </p>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.8fr)_minmax(300px,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <ClientInformationCard
            info={{
              email: client.email,
              phone: client.phone,
              alternatePhone: client.alternate_phone,
              preferredContact: COMMUNICATION_LABELS[client.preferred_communication as CommunicationMethod] ?? null,
              mailingAddress: formatAddress(client),
              clientSince: formatDate(client.created_at),
              projectCount: projects?.length ?? 0,
              notes: client.notes,
            }}
            identity={{
              name,
              initials,
              company: client.company_name,
              meta: (
                <>
                  <li className="font-mono">{`#${client.client_number}`}</li>
                  <li>
                    <ClientStatusBadge status={client.status as ClientStatus} />
                  </li>
                </>
              ),
              actions: manager && (
                <>
                  <Button variant="outline" className="bg-white" render={<Link href={`/clients/${client.id}/edit`} />} nativeButton={false}>
                    <Pencil data-icon="inline-start" />
                    Edit
                  </Button>
                  <Button render={<Link href={`/projects/new?client=${client.id}`} />} nativeButton={false}>
                    <Plus data-icon="inline-start" />
                    New project
                  </Button>
                </>
              ),
            }}
          />

          <section aria-labelledby="client-projects" className="flex flex-col gap-3">
            <h2 id="client-projects" className="font-serif text-lg font-semibold text-foreground">
              Projects
            </h2>
            {projects?.length ? (
              <ProjectList projects={projects as unknown as ProjectListItem[]} warrantyByProject={warrantyByProject} />
            ) : (
              <p className="rounded-xl border border-dashed bg-card p-6 text-sm text-muted-foreground">
                No projects for this client yet.
              </p>
            )}
          </section>

          <ActivityPanel clientId={client.id} activity={activity} />
        </div>

        <aside id="portal-access" className="flex min-w-0 scroll-mt-24 flex-col gap-6">
          {portalData && 'accounts' in portal ? (
            <ManagePortalAccessPanel clientId={client.id} {...portal} />
          ) : (
            manager && (
              <PortalAccessPanel
                clientId={client.id}
                hasAccess={Boolean(client.portal_user_id)}
                pendingInvite={Boolean(inviteRes.data?.length)}
                email={client.email}
              />
            )
          )}
          <ContactsPanel clientId={client.id} contacts={(contactsRes.data ?? []) as ContactRow[]}
            canEdit={manager}
            accountStatusByContact={accountStatusByContact}
          />
        </aside>
      </div>
    </div>
  )
}
