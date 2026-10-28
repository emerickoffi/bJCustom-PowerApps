import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Pencil, Plus, UserRound as UserRoundIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requireStaff, canManage } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { getProfileNames, PROJECT_SUMMARY_COLUMNS, type ProjectSummary } from '@/lib/queries'
import { PageHeader } from '@/components/shared/page-header'
import { ClientInformationCard } from '@/components/clients/client-information-card'
import { ClientStatusBadge } from '@/components/shared/status-badge'
import { ProjectList } from '@/components/projects/project-list'
import {
  ActivityPanel,
  ContactsPanel,
  PortalAccessPanel,
  type ActivityRow,
  type ContactRow,
} from '@/components/clients/client-panels'
import {
  ManagePortalAccessPanel,
  type PortalAccountRow,
  type PortalContactOption,
} from '@/components/clients/manage-portal-access'
import { COMMUNICATION_LABELS, type ClientStatus, type CommunicationMethod } from '@/lib/domain'
import { formatAddress, formatDate } from '@/lib/format'

export const metadata: Metadata = { title: 'Client' }

type ContactLite = { id: string; first_name: string; last_name: string; email: string | null }

async function loadPortalAccess(
  client: { id: string; first_name: string; last_name: string; email: string | null },
  contacts: ContactLite[],
  projects: { id: string; name?: string; project_number?: string }[],
) {
  const supabase = await createClient()
  const { data: accounts } = await supabase
    .from('portal_accounts')
    .select('id, user_id, portal_project_access(project_id)')
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

  const contactOptions: PortalContactOption[] = [
    { value: 'primary', label: `${client.first_name} ${client.last_name} (primary)`, hasEmail: Boolean(client.email) },
    ...contacts.map((c) => ({ value: c.id, label: `${c.first_name} ${c.last_name}`, hasEmail: Boolean(c.email) })),
  ]

  return {
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
    ? await supabase.from('projects').select(PROJECT_SUMMARY_COLUMNS).in('id', projectIds).order('updated_at', { ascending: false })
    : { data: [] }

  const names = await getProfileNames((activityRes.data ?? []).map((a) => a.created_by))
  const activity: ActivityRow[] = (activityRes.data ?? []).map((a) => ({
    ...a,
    author: a.created_by ? (names.get(a.created_by) ?? 'Team member') : 'System',
  }))

  const name = [client.first_name, client.middle_name, client.last_name].filter(Boolean).join(' ')
  const portal = session.role === 'org_admin' ? await loadPortalAccess(client, (contactsRes.data ?? []).filter((c) => !c.archived_at), projects ?? []) : null

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={UserRoundIcon}
        backHref="/clients"
        backLabel="Clients"
        eyebrow={
          <span className="flex items-center gap-2 normal-case tracking-normal">
            <span className="font-mono">{`#${client.client_number}`}</span>
            <ClientStatusBadge status={client.status as ClientStatus} />
          </span>
        }
        title={name}
        description={client.company_name ?? undefined}
        actions={
          manager && (
            <>
              <Button variant="outline" size="lg" render={<Link href={`/clients/${client.id}/edit`} />} nativeButton={false}>
                <Pencil data-icon="inline-start" />
                Edit
              </Button>
              <Button size="lg" render={<Link href={`/projects/new?client=${client.id}`} />} nativeButton={false}>
                <Plus data-icon="inline-start" />
                New project
              </Button>
            </>
          )
        }
      />

      {notice === 'contacts_not_saved' && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          The client was created, but the additional contacts could not be saved. Please add them from the Contacts section below.
        </p>
      )}

      <div className="grid gap-8 xl:grid-cols-[1fr_24rem]">
        <div className="flex flex-col gap-8">
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
          />

          <section aria-labelledby="client-projects" className="flex flex-col gap-4">
            <h2 id="client-projects" className="font-serif text-lg font-semibold text-foreground">
              Projects
            </h2>
            {projects?.length ? (
              <ProjectList projects={projects as unknown as ProjectSummary[]} />
            ) : (
              <p className="rounded-xl border border-dashed bg-card p-6 text-sm text-muted-foreground">
                No projects for this client yet.
              </p>
            )}
          </section>

          <ActivityPanel clientId={client.id} activity={activity} />
        </div>

        <aside className="flex flex-col gap-6">
          {portal ? (
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
          <ContactsPanel clientId={client.id} contacts={(contactsRes.data ?? []) as ContactRow[]} canEdit={manager} />
        </aside>
      </div>
    </div>
  )
}
