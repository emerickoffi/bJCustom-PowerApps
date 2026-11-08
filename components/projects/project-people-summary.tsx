import Link from 'next/link'
import { ArrowRight, Users } from 'lucide-react'
import type { ProjectHomeowners } from '@/lib/project-homeowners-data'
import type { ProjectCompanyContacts, ProjectContact } from '@/lib/project-contacts-data'

type Entry = { key: string; name: string; detail: string | null }

const PREVIEW = 3

function Group({ title, entries, empty }: { title: string; entries: Entry[]; empty: string }) {
  const shown = entries.slice(0, PREVIEW)
  const more = entries.length - shown.length
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title} <span className="tabular-nums">({entries.length})</span>
      </h3>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {shown.map((e) => (
            <li key={e.key} className="min-w-0 truncate text-sm">
              <span className="font-medium text-foreground">{e.name}</span>
              {e.detail && <span className="text-muted-foreground"> · {e.detail}</span>}
            </li>
          ))}
          {more > 0 && <li className="text-xs text-muted-foreground">+{more} more</li>}
        </ul>
      )}
    </div>
  )
}

export function ProjectPeopleSummary({
  id,
  projectId,
  homeowners,
  managerName,
  members,
  contacts,
  companies,
}: {
  id?: string
  projectId: string
  homeowners: ProjectHomeowners
  managerName: string | null
  members: { id: string; name: string; project_role: string | null }[]
  contacts: ProjectContact[] | null
  companies: ProjectCompanyContacts[]
}) {
  const homeownerEntries: Entry[] = homeowners.groups.flatMap((g) =>
    g.contacts.length
      ? [...g.contacts]
          .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
          .map((c) => ({ key: c.id, name: c.name, detail: c.isPrimary ? 'Primary' : c.relationship || null }))
      : g.client
        ? [{ key: g.linkId, name: g.client.name, detail: g.linkRelationship || null }]
        : [],
  )
  const teamEntries: Entry[] = [
    ...(managerName ? [{ key: 'manager', name: managerName, detail: 'Project manager' }] : []),
    ...members.map((m) => ({ key: m.id, name: m.name, detail: m.project_role })),
  ]
  const outsideEntries: Entry[] = [
    ...companies.map((c) => ({ key: `co:${c.subcontractor_company_id}`, name: c.company_name, detail: 'Subcontractor' })),
    ...(contacts ?? [])
      .filter((c) => c.status === 'active')
      .map((c) => ({ key: c.association_id, name: c.name, detail: [c.project_role, c.company_name].filter(Boolean).join(' · ') || null })),
  ]

  return (
    <section id={id} aria-labelledby="project-people-heading" className="surface flex scroll-mt-36 flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sage text-primary">
            <Users className="size-4" aria-hidden="true" />
          </span>
          <h2 id="project-people-heading" className="font-serif text-lg font-semibold text-foreground">
            People
          </h2>
        </div>
        <Link
          href={`/projects/${projectId}/contacts`}
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Manage people
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </header>
      <div className="grid gap-4 sm:grid-cols-3">
        <Group title="Homeowners" entries={homeownerEntries} empty="No homeowner linked" />
        <Group title="Builder team" entries={teamEntries} empty="No team assigned" />
        <Group
          title="Subcontractors & professionals"
          entries={outsideEntries}
          empty={contacts === null ? 'Directory contacts could not be loaded' : 'None added yet'}
        />
      </div>
    </section>
  )
}
