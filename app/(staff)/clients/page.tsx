import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus, Users, Users as UsersIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requireStaff, canManage } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { PageHeader, EmptyState } from '@/components/shared/page-header'
import { ListFilters } from '@/components/shared/list-filters'
import { ClientCard, type DirectoryContact } from '@/components/clients/client-card'
import type { ClientProject } from '@/components/clients/client-projects-disclosure'
import { CLIENT_STATUS_LABELS, type ClientStatus } from '@/lib/domain'
import { sanitizeSearch } from '@/lib/format'
import type { ClientSummary } from '@/lib/queries'

export const metadata: Metadata = { title: 'Clients' }

const CLIENT_STATUSES = Object.keys(CLIENT_STATUS_LABELS) as ClientStatus[]

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>
}) {
  const session = await requireStaff()
  const params = await searchParams
  const q = sanitizeSearch(params.q)
  const status = CLIENT_STATUSES.includes(params.status as ClientStatus) ? (params.status as ClientStatus) : null

  const supabase = await createClient()
  let query = supabase
    .from('clients')
    .select(
      'id, client_number, first_name, last_name, company_name, email, phone, city, state, status, portal_user_id, created_at',
    )
    .eq('organization_id', session.organizationId)
    .order('last_name')
    .limit(300)
  if (status) query = query.eq('status', status)
  else query = query.neq('status', 'archived')
  if (q) {
    const { data: contactMatches } = await supabase
      .from('client_contacts')
      .select('client_id')
      .eq('organization_id', session.organizationId)
      .is('archived_at', null)
      .or(`first_name.ilike.*${q}*,last_name.ilike.*${q}*,email.ilike.*${q}*,phone.ilike.*${q}*`)
      .limit(300)
    const contactClientIds = [...new Set((contactMatches ?? []).map((c) => c.client_id as string))]
    query = query.or(
      [
        `first_name.ilike.*${q}*`,
        `last_name.ilike.*${q}*`,
        `email.ilike.*${q}*`,
        `phone.ilike.*${q}*`,
        `company_name.ilike.*${q}*`,
        ...(contactClientIds.length ? [`id.in.(${contactClientIds.join(',')})`] : []),
      ].join(','),
    )
  }
  const { data } = await query
  const clients = (data ?? []) as ClientSummary[]
  const manager = canManage(session.role)
  const filtered = Boolean(q || status)

  const clientIds = clients.map((c) => c.id)
  const [contactsResult, primaryProjectsResult, linkedProjectsResult] = clientIds.length
    ? await Promise.all([
        supabase
          .from('client_contacts')
          .select(
            'id, client_id, first_name, middle_name, last_name, relationship, email, phone, preferred_communication, is_primary',
          )
          .in('client_id', clientIds)
          .is('archived_at', null)
          .order('is_primary', { ascending: false })
          .order('last_name'),
        supabase
          .from('projects')
          .select('id, name, project_number, status, primary_client_id')
          .in('primary_client_id', clientIds),
        supabase.from('project_clients').select('project_id, client_id').in('client_id', clientIds),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ]
  let projectsFailed = Boolean(primaryProjectsResult.error || linkedProjectsResult.error)

  const projectById = new Map<string, ClientProject>()
  for (const p of (primaryProjectsResult.data ?? []) as (ClientProject & { primary_client_id: string | null })[]) {
    projectById.set(p.id, { id: p.id, name: p.name, project_number: p.project_number, status: p.status })
  }
  const missingProjectIds = [
    ...new Set(
      ((linkedProjectsResult.data ?? []) as { project_id: string }[])
        .map((l) => l.project_id)
        .filter((id) => !projectById.has(id)),
    ),
  ]
  if (missingProjectIds.length) {
    const { data: linkedProjects, error: linkedProjectsError } = await supabase
      .from('projects')
      .select('id, name, project_number, status')
      .in('id', missingProjectIds)
    if (linkedProjectsError) projectsFailed = true
    for (const p of (linkedProjects ?? []) as ClientProject[]) projectById.set(p.id, p)
  }

  const contactsByClient = new Map<string, DirectoryContact[]>()
  for (const contact of (contactsResult.data ?? []) as DirectoryContact[]) {
    const list = contactsByClient.get(contact.client_id) ?? []
    list.push(contact)
    contactsByClient.set(contact.client_id, list)
  }
  const projectsByClient = new Map<string, Set<string>>()
  const addProject = (clientId: string | null, projectId: string) => {
    if (!clientId || !projectById.has(projectId)) return
    const set = projectsByClient.get(clientId) ?? new Set<string>()
    set.add(projectId)
    projectsByClient.set(clientId, set)
  }
  for (const p of (primaryProjectsResult.data ?? []) as { id: string; primary_client_id: string | null }[]) {
    addProject(p.primary_client_id, p.id)
  }
  for (const link of (linkedProjectsResult.data ?? []) as { project_id: string; client_id: string }[]) {
    addProject(link.client_id, link.project_id)
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={UsersIcon}
        title="Clients"
        description="Homeowners and prospects, with their contacts, projects, and communication history."
        actions={
          manager && (
            <Button size="lg" render={<Link href="/clients/new" />} nativeButton={false}>
              <Plus data-icon="inline-start" />
              New client
            </Button>
          )
        }
      />
      <ListFilters
        searchPlaceholder="Search clients or contacts by name, email, or phone"
        defaultQuery={q}
        defaultStatus={status ?? ''}
        statusOptions={CLIENT_STATUSES.map((s) => ({ value: s, label: CLIENT_STATUS_LABELS[s] }))}
      />
      {clients.length ? (
        <ul className="grid gap-4 2xl:grid-cols-2" aria-label={`${clients.length} clients`}>
          {clients.map((client) => {
            const contacts = contactsByClient.get(client.id) ?? []
            const primary = contacts.find((c) => c.is_primary) ?? null
            const secondary = contacts.find((c) => !c.is_primary) ?? null
            return (
              <li key={client.id} className="flex">
                <div className="flex w-full flex-col [&>article]:flex-1">
                  <ClientCard
                    client={client}
                    primary={primary}
                    secondary={secondary}
                    projects={[...(projectsByClient.get(client.id) ?? [])]
                      .map((id) => projectById.get(id) as ClientProject)
                      .sort((a, b) => a.name.localeCompare(b.name))}
                    projectsFailed={projectsFailed}
                    canManageContacts={manager}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <EmptyState
          icon={Users}
          title={filtered ? 'No matching clients' : 'No clients yet'}
          description={
            filtered
              ? 'Try a different search or status filter.'
              : manager
                ? 'Add your first homeowner to start a project for them.'
                : 'Clients on projects you are assigned to will appear here.'
          }
          action={
            manager &&
            !filtered && (
              <Button render={<Link href="/clients/new" />} nativeButton={false}>
                Add client
              </Button>
            )
          }
        />
      )}
    </div>
  )
}
