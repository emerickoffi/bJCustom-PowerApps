// TEMPORARY verification harness. Not part of the app; removed before commit.
import { ContactsDirectory } from '@/components/contacts/contacts-directory'
import { ContactOverlays } from '@/components/contacts/contact-overlays'
import { ContactsCreateAction } from '@/components/contacts/contacts-primary-action'
import { ClientCard } from '@/components/clients/client-card'
import { ClientTable } from '@/components/clients/client-table'
import { ClientPreviewLayout } from '@/components/clients/client-preview'
import { ClientEditOverlay, type EditableClient } from '@/components/clients/client-edit-overlay'
import { FloatingCreateAction } from '@/components/app/floating-create-action'
import { DirectoryViews } from '@/components/shared/directory-views'
import { ListFilters } from '@/components/shared/list-filters'
import { parseView as parseContactsView, type CompanyView, type PersonView } from '@/lib/contacts'
import type { CompanyProfile } from '@/lib/contacts-data'
import { parseView } from '@/lib/directory'
import type { ClientSummary } from '@/lib/queries'
import { ID } from './ids'
import { HarnessShell } from './mock'

const now = '2026-01-01T00:00:00Z'
const projects = (n: number) => Array.from({ length: n }, (_, i) => ({ project_id: `p${i + 1}`, name: `Project ${i + 1}`, project_number: `BJ-2026-00${i + 1}` }))
const people: PersonView[] = [
  { id: ID(1), first_name: 'Ana', last_name: 'Ruiz', email: 'ana.ruiz@example.com', primary_phone: '5550100101', secondary_phone: '5550100102', specialty: 'Structural engineer', status: 'active', updated_at: now, companies: [{ company_id: ID(21), company_name: 'Acme Framing & Structural Carpentry', role: 'Lead engineer' }] as PersonView['companies'], categories: ['professionals'], projects: projects(5) },
  { id: ID(2), first_name: 'Jo', last_name: 'Park', email: null, primary_phone: null, secondary_phone: null, specialty: null, status: 'active', updated_at: now, companies: [], categories: [], projects: [] },
  { id: ID(3), first_name: 'Sam', last_name: 'Whitfield', email: 'sam@example.com', primary_phone: '5550100104', secondary_phone: null, specialty: 'Electrician', status: 'active', updated_at: now, companies: [], categories: ['subcontractors'], projects: projects(1) },
  { id: ID(4), first_name: 'Tori', last_name: 'Vance', email: 'tori@example.com', primary_phone: '5550100105', secondary_phone: null, specialty: 'Plumber', status: 'active', updated_at: now, companies: [], categories: ['subcontractors'], projects: [] },
]
const companies: CompanyView[] = [
  { id: ID(21), company_name: 'Acme Framing & Structural Carpentry', company_email: 'office@acmeframing.example.com', company_phone: '5550100200', status: 'active', subcontractor_company_id: 's1', trade: 'Framing', categories: ['subcontractors', 'suppliers'], product_categories: ['Engineered lumber', 'Trusses'], primary_contact: { person_id: ID(1), name: 'Ana Ruiz' }, contact_count: 4, projects: projects(2) },
  { id: ID(22), company_name: 'Volt Electric', company_email: null, company_phone: null, status: 'active', subcontractor_company_id: null, categories: [], product_categories: [], primary_contact: null, contact_count: 0, projects: [] },
  { id: ID(23), company_name: 'Clearwater Plumbing', company_email: 'hello@clearwater.example.com', company_phone: '5550100201', status: 'active', subcontractor_company_id: null, categories: ['suppliers'], product_categories: ['Fixtures'], primary_contact: null, contact_count: 2, projects: [] },
]
const client = (n: number, first: string, last: string, over: Partial<ClientSummary> = {}): ClientSummary => ({
  id: ID(n), client_number: 1000 + n, first_name: first, last_name: last, company_name: null, email: `${first.toLowerCase()}@example.com`, phone: '555-010-0300', city: 'Flagstaff', state: 'AZ', status: 'active' as ClientSummary['status'], portal_user_id: null, created_at: now, ...over,
})
const clients = [client(31, 'Christopher', 'Lee-Montgomery'), client(32, 'Morgan', 'Vale', { email: null, phone: null, city: null, state: null }), client(33, 'Riley', 'Chen'), client(34, 'Deleted', 'Client')]

type Params = { mode?: string; view?: string; new?: string; editCompany?: string; editClient?: string; manager?: string }

export default async function Harness({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams
  if (params.mode === 'clients') {
    const manager = params.manager !== '0'
    const editing = clients.find((c) => c.id === params.editClient)
    const editClient: EditableClient | null = editing && manager ? { ...editing, notes: 'Wants weekly photo updates.' } : null
    const rows = clients.map((c) => ({ client: c, primary: null, secondary: null, projects: [] }))
    return (
      <HarnessShell>
        <div className="mx-auto flex max-w-[1700px] flex-col gap-4 p-6">
          <h1 className="font-serif text-xl">Clients (harness)</h1>
          <ListFilters searchPlaceholder="Search clients" defaultQuery="" defaultStatus="" statusOptions={[]} carryParams={['previewClient', 'mode']} />
          <ClientPreviewLayout clients={clients.map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`, number: c.client_number }))} canManage={manager} editing={Boolean(editClient)}>
            <DirectoryViews
              module="clients"
              initialView={parseView(params.view)}
              desktopDefault="table"
              summary={`Showing 1–${clients.length} of ${clients.length} clients`}
              cards={
                <ul className="grid gap-4 2xl:grid-cols-2 xl:group-data-preview-open/preview:grid-cols-1 xl:group-data-preview-open/preview:@5xl:grid-cols-2">
                  {rows.map((row) => (
                    <li key={row.client.id} className="flex">
                      <div className="flex w-full flex-col [&>article]:flex-1">
                        <ClientCard client={row.client} primary={null} secondary={null} projects={[]} canManageContacts={manager} />
                      </div>
                    </li>
                  ))}
                </ul>
              }
              table={<ClientTable rows={rows.map((row) => ({ client: row.client, primary: null, projectCount: 2 }))} projectsFailed={false} canManageContacts={manager} />}
            />
            <div style={{ height: 900 }} aria-hidden="true" />
          </ClientPreviewLayout>
          <ClientEditOverlay client={editClient} />
          {manager && <FloatingCreateAction href="/clients/new" label="Add client" icon="client" />}
        </div>
      </HarnessShell>
    )
  }

  const found = companies.find((c) => c.id === params.editCompany)
  const company = found
    ? ({ ...found, secondary_company_phone: null, website: null, address_line1: null, city: null, state: null, postal_code: null, notes: null, business_categories: found.categories, created_at: now } as unknown as CompanyProfile)
    : null
  const formOpen = params.new === 'contact' || params.new === 'company' || Boolean(company)
  return (
    <HarnessShell>
      <div className="mx-auto flex max-w-[1700px] flex-col gap-4 p-6">
        <h1 className="font-serif text-xl">Contacts (harness)</h1>
        <ContactsDirectory people={people} companies={companies} initialView={parseContactsView(params.view)} initialCategory={null} formOpen={formOpen} />
        <ContactOverlays companies={[]} projects={[]} person={null} company={company} />
        <ContactsCreateAction />
        <div style={{ height: 900 }} aria-hidden="true" />
      </div>
    </HarnessShell>
  )
}
