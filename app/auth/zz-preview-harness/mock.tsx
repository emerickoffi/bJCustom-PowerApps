'use client'

// TEMPORARY verification harness. Not part of the app; removed before commit.
import { FloatingActionStack, FloatingActionsProvider } from '@/components/app/floating-actions'
import { ID } from './ids'


const person = (n: number, over: Record<string, unknown> = {}) => ({
  kind: 'person',
  id: ID(n),
  status: 'active',
  specialty: 'Structural engineer',
  email: 'ana.ruiz@example.com',
  primaryPhone: '5550100101',
  secondaryPhone: '5550100102',
  companies: [
    { id: ID(21), name: 'Acme Framing & Structural Carpentry', role: 'Lead engineer', primary: true, href: `/contacts/companies/${ID(21)}` },
    { id: ID(22), name: 'Volt Electric', role: null, primary: false, href: `/contacts/companies/${ID(22)}` },
  ],
  projects: [1, 2, 3, 4, 5].map((i) => ({ id: `p${i}`, name: `Project ${i} at Whispering Pines`, number: `BJ-2026-00${i}`, role: i % 2 ? 'Inspector' : null, href: `/projects/p${i}` })),
  access: { state: 'ready', status: 'active', company: 'Acme Framing & Structural Carpentry', manageHref: '/subcontractors/s1' },
  notes: 'Prefers site visits before 10am.\nGate code is on file with the superintendent.',
  ...over,
})

const company = (n: number, over: Record<string, unknown> = {}) => ({
  kind: 'company',
  id: ID(n),
  status: 'active',
  email: 'office@acmeframing.example.com',
  phone: '5550100200',
  secondaryPhone: null,
  website: 'acmeframing.example.com',
  address: '4182 Whispering Pines Trail, Unit B, Flagstaff, AZ 86001',
  subcontractor: { href: '/subcontractors/s1', trade: 'Framing' },
  categories: ['Subcontractors', 'Suppliers'],
  productCategories: ['Engineered lumber', 'Trusses'],
  contacts: [
    { id: ID(1), name: 'Ana Ruiz', role: 'Lead engineer', primary: true, email: 'ana.ruiz@example.com', phone: '5550100101', href: `/contacts/people/${ID(1)}` },
    { id: ID(2), name: 'Jo Park', role: 'Foreman', primary: false, email: null, phone: '5550100103', href: `/contacts/people/${ID(2)}` },
    { id: ID(3), name: 'Sam Whitfield', role: null, primary: false, email: 'sam@example.com', phone: null, href: `/contacts/people/${ID(3)}` },
    { id: ID(4), name: 'Tori Vance', role: 'Estimator', primary: false, email: null, phone: null, href: `/contacts/people/${ID(4)}` },
  ],
  projects: [
    { id: 'p1', name: 'Lee-Montgomery Residence', number: 'BJ-2026-001', href: '/projects/p1', company: true, people: ['Ana Ruiz (Inspector)'] },
    { id: 'p2', name: 'Vale Cottage', number: 'BJ-2026-002', href: '/projects/p2', company: false, people: ['Jo Park'] },
  ],
  notes: 'Net 30. Requires 2 weeks lead time on trusses.',
  ...over,
})

const client = (n: number, over: Record<string, unknown> = {}) => ({
  id: ID(n),
  contacts: {
    state: 'ready',
    primary: { name: 'Christopher Lee-Montgomery', relationship: null, preference: 'Prefers email', email: 'chris@example.com', phone: '5550100300' },
    secondary: { name: 'Pat Lee', relationship: 'Spouse', preference: null, email: null, phone: '5550100301' },
    otherCount: 1,
  },
  projects: {
    state: 'ready',
    items: [
      { id: 'p1', name: 'Lee-Montgomery Residence at Whispering Pines', number: 'BJ-2026-001', status: 'under_construction', href: '/projects/p1' },
      { id: 'p2', name: 'Guest House', number: 'BJ-2026-002', status: 'completed', href: '/projects/p2' },
      { id: 'p3', name: 'Detached Garage', number: 'BJ-2026-003', status: 'under_construction', href: '/projects/p3' },
      { id: 'p4', name: 'Pool Cabana', number: 'BJ-2026-004', status: 'under_construction', href: '/projects/p4' },
    ],
  },
  portal: { state: 'ready', status: 'invited', detail: 'They gain access once they sign up and confirm their email.', manageHref: `/clients/${ID(n)}#portal-access` },
  notes: 'Wants weekly photo updates.',
  contactsHref: `/clients/${ID(n)}#contacts`,
  createProjectHref: `/projects/new?client=${ID(n)}`,
  ...over,
})

type Reply = { status?: number; delay?: number; body: unknown }
const replies: Record<string, Reply> = {
  [`/api/contacts/people/${ID(1)}/preview`]: { delay: 1500, body: person(1) },
  [`/api/contacts/people/${ID(2)}/preview`]: {
    body: person(2, { specialty: null, email: null, primaryPhone: null, secondaryPhone: null, companies: [], projects: [], notes: null, access: { state: 'ready', status: 'none', company: null, manageHref: null } }),
  },
  [`/api/contacts/people/${ID(3)}/preview`]: { body: person(3, { status: 'inactive', companies: null, projects: null, access: { state: 'error' } }) },
  [`/api/contacts/people/${ID(4)}/preview`]: { status: 500, body: { error: 'boom' } },
  [`/api/contacts/companies/${ID(21)}/preview`]: { body: company(21) },
  [`/api/contacts/companies/${ID(22)}/preview`]: { body: company(22, { subcontractor: null, categories: [], productCategories: [], contacts: [], projects: [], notes: null, website: null, address: null }) },
  [`/api/contacts/companies/${ID(23)}/preview`]: { status: 403, body: { error: 'no' } },
  [`/api/clients/${ID(31)}/preview`]: { delay: 1500, body: client(31) },
  [`/api/clients/${ID(32)}/preview`]: {
    body: client(32, {
      contacts: { state: 'ready', primary: { name: 'Morgan Vale', relationship: null, preference: null, email: null, phone: null }, secondary: null, otherCount: 0 },
      projects: { state: 'ready', items: [] },
      portal: { state: 'ready', status: 'not_provisioned', detail: null, manageHref: `/clients/${ID(32)}#portal-access` },
      notes: null,
    }),
  },
  [`/api/clients/${ID(33)}/preview`]: { body: client(33, { contacts: { state: 'error' }, projects: { state: 'error' }, portal: { state: 'hidden' }, createProjectHref: null }) },
  [`/api/clients/${ID(34)}/preview`]: { status: 404, body: { error: 'gone' } },
}

if (typeof window !== 'undefined' && !(window as unknown as { __harness?: boolean }).__harness) {
  ;(window as unknown as { __harness?: boolean }).__harness = true
  const real = window.fetch.bind(window)
  const log: string[] = []
  ;(window as unknown as { __previewRequests: string[] }).__previewRequests = log
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url
    const reply = replies[url]
    if (!reply) return real(input, init)
    log.push(url)
    if (reply.delay) await new Promise((resolve) => setTimeout(resolve, reply.delay))
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { 'Content-Type': 'application/json' } })
  }
}

export function HarnessShell({ children }: { children: React.ReactNode }) {
  return (
    <FloatingActionsProvider>
      <header className="sticky top-0 z-30 flex h-16 items-center border-b bg-white px-6 text-sm text-muted-foreground">App header (harness)</header>
      {children}
      <FloatingActionStack>
        <div data-floating-control className="group relative order-last">
          <button type="button" aria-label="Ask B & J AI" className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            AI
          </button>
        </div>
      </FloatingActionStack>
    </FloatingActionsProvider>
  )
}
