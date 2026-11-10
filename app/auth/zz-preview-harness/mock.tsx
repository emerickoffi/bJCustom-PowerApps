'use client'

// TEMPORARY verification harness. Not part of the app; removed before commit.
const sub = (kind: 'company' | 'person', i: number, name: string, extra: Record<string, unknown> = {}) => ({
  key: `${kind}:${i}`,
  kind,
  name,
  company: null,
  trade: null,
  role: null,
  href: kind === 'company' ? `/subcontractors/${i}` : `/contacts/people/${i}`,
  ...extra,
})

const P = (n: number) => `00000000-0000-4000-8000-00000000000${n}`

const previews: Record<string, unknown> = {
  [P(1)]: {
    id: P(1),
    address: '4182 Whispering Pines Trail, Unit B, Flagstaff, AZ 86001',
    people: {
      manager: { name: 'Dana Ortiz', detail: null, email: 'dana@example.com', phone: null },
      homeowners: {
        state: 'ready',
        primary: { name: 'Christopher Lee-Montgomery', detail: null, email: 'chris@example.com', phone: '(555) 010-0100' },
        secondary: { name: 'Pat Lee', detail: 'Spouse', email: null, phone: '555-0101' },
        otherCount: 1,
      },
      subcontractors: {
        state: 'ready',
        items: [
          sub('company', 1, 'Acme Framing & Structural Carpentry', { trade: 'Framing' }),
          sub('company', 2, 'Volt Electric', { trade: 'Electrical' }),
          sub('person', 3, 'Ana Ruiz', { role: 'Inspector' }),
          sub('person', 4, 'Jo Park', { role: 'Foreman', company: 'Acme Framing & Structural Carpentry', trade: 'Framing' }),
          sub('person', 5, 'Lee Tile', { trade: 'Tile' }),
          sub('person', 6, 'Sam Whitfield', { role: 'Site lead', company: 'Volt Electric', trade: 'Electrical' }),
          sub('person', 7, 'Tori Vance', { role: 'Plumber', company: 'Clearwater Plumbing' }),
        ],
      },
      canAssign: true,
      assignNote: null,
      peopleHref: `/projects/${P(1)}/contacts`,
    },
    nextActivity: {
      state: 'ready',
      scheduleHref: `/projects/${P(1)}/schedule`,
      href: `/projects/${P(1)}/schedule?activity=a1`,
      name: 'Rough electrical inspection',
      milestone: true,
      plannedLabel: 'Mar 2, 2026 – Mar 6, 2026',
      status: 'in_progress',
      overdue: false,
      assignedTo: 'Dana Ortiz · Volt Electric',
    },
    latestUpdate: {
      state: 'ready',
      href: `/projects/${P(1)}/daily-logs/l1`,
      dateLabel: 'Mar 1, 2026',
      draft: false,
      summary:
        'Framing crew completed second-floor joists and began sheathing on the north elevation. Electrician walked the site and marked panel location. Delivery of windows confirmed for Thursday morning; staging area cleared.',
      photos: [
        { id: 'ph1', url: '/branding/bj-custom-homes-logo.png', alt: 'North elevation sheathing' },
        { id: 'ph2', url: '/missing-photo.jpg', alt: 'Second-floor joists' },
      ],
      morePhotos: 4,
      photosFailed: false,
    },
    questions: {
      state: 'ready',
      total: 5,
      href: `/projects/${P(1)}/rfis`,
      items: [
        { id: 'q1', ref: 'RFI-007', subject: 'Window header height at the stair landing conflicts with the structural drawing', responsible: 'Sam Whitfield · Volt Electric', context: 'Overdue · was due Feb 20, 2026', overdue: true, href: '#' },
        { id: 'q2', ref: 'RFI-004', subject: 'Tile layout in primary bath', responsible: 'Lee Tile', context: 'Answered · waiting for review', overdue: false, href: '#' },
        { id: 'q3', ref: 'RFI-009', subject: 'Garage slab slope', responsible: 'Not assigned', context: 'Open · no due date', overdue: false, href: '#' },
      ],
    },
  },
  [P(2)]: {
    id: P(2),
    address: null,
    people: {
      manager: null,
      homeowners: { state: 'ready', primary: null, secondary: null, otherCount: 0 },
      subcontractors: { state: 'ready', items: [] },
      canAssign: true,
      assignNote: null,
      peopleHref: `/projects/${P(2)}/contacts`,
    },
    nextActivity: { state: 'undated', scheduleHref: `/projects/${P(2)}/schedule`, openCount: 6, firstName: 'Site clearing' },
    latestUpdate: { state: 'empty' },
    questions: { state: 'ready', items: [], total: 0, href: '#' },
  },
  [P(3)]: {
    id: P(3),
    address: '12 Canyon Rd, Sedona, AZ',
    people: {
      manager: { name: 'Former team member', detail: null, email: null, phone: null },
      homeowners: { state: 'error' },
      subcontractors: { state: 'error' },
      canAssign: false,
      assignNote: 'This project is completed, so new people and companies can’t be added.',
      peopleHref: `/projects/${P(3)}/contacts`,
    },
    nextActivity: { state: 'error', scheduleHref: '#' },
    latestUpdate: { state: 'error' },
    questions: { state: 'error' },
  },
}

const person = (i: number, name: string, extra: Record<string, unknown> = {}) => ({
  kind: 'person',
  key: `person:${i}`,
  id: `${i}`,
  name,
  email: `${name.split(' ')[0].toLowerCase()}@example.com`,
  emailEligibility: { eligible: false, reason: 'Email delivery is not configured.' },
  affiliations: [{ relationship_id: `r${i}`, company_name: 'Volt Electric', position: 'Electrician', is_primary: true }],
  defaultRelationshipId: `r${i}`,
  suggestedRole: '',
  account: 'not_provisioned',
  manageAccessHref: null,
  assigned: false,
  disabledReason: null,
  trade: 'Electrical',
  isSubcontractor: true,
  ...extra,
})
const company = (i: number, name: string, extra: Record<string, unknown> = {}) => ({
  kind: 'company',
  key: `company:${i}`,
  id: `${i}`,
  name,
  email: null,
  peopleCount: 3,
  trade: 'Framing',
  assigned: false,
  disabledReason: null,
  isSubcontractor: true,
  ...extra,
})

const directory = (projectId: string) => ({
  projectId,
  canCreateCompany: true,
  rows: [
    person(11, 'Ana Ruiz', { assigned: true }),
    person(12, 'Marcus Bell'),
    person(13, 'Priya Natarajan-Whitcombe', { trade: 'Plumbing', affiliations: [], defaultRelationshipId: null }),
    person(14, 'Owen Hart', { disabledReason: 'Inactive contact' }),
    company(21, 'Acme Framing & Structural Carpentry', { assigned: true }),
    company(22, 'Clearwater Plumbing', { trade: 'Plumbing' }),
    company(23, 'Summit Roofing', { trade: 'Roofing' }),
  ],
})

declare global {
  interface Window {
    __harness?: { failPreview?: boolean; failDirectory?: number; calls: string[] }
  }
}

if (typeof window !== 'undefined' && !window.__harness) {
  window.__harness = { calls: [] }
  const real = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const match = url.match(/\/api\/projects\/([^/]+)\/(preview|assignment-directory)/)
    if (!match) return real(input, init)
    window.__harness!.calls.push(url)
    await new Promise((r) => setTimeout(r, 250))
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
    const id = decodeURIComponent(match[1])
    if (match[2] === 'preview') {
      if (window.__harness!.failPreview || !previews[id]) return json({ error: 'failed' }, 500)
      return json(previews[id])
    }
    const fail = window.__harness!.failDirectory
    if (fail) return json({ error: 'This project is completed, so new people and companies can’t be added.' }, fail)
    return json(directory(id))
  }
}

export function HarnessMock() {
  return null
}
