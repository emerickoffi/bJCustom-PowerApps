import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, Users } from 'lucide-react'
import type { ProjectHomeowners } from '@/lib/project-homeowners-data'
import type { ProjectCompanyContacts, ProjectContact } from '@/lib/project-contacts-data'

type Entry = { key: string; name: string; detail: string | null }

const PREVIEW = 4

/** Joined queries can return the same record twice; keep the first occurrence of each key. */
function unique(entries: Entry[]) {
  const seen = new Set<string>()
  return entries.filter((e) => (seen.has(e.key) ? false : (seen.add(e.key), true)))
}

function Group({
  title,
  entries,
  empty,
  emptyAction,
  moreHref,
  footer,
}: {
  title: string
  entries: Entry[]
  empty: string
  /** Shown under the empty message only. */
  emptyAction?: ReactNode
  moreHref: string
  footer?: ReactNode
}) {
  const shown = entries.slice(0, PREVIEW)
  const more = entries.length - shown.length
  return (
    <div className="flex min-w-0 flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title} <span className="tabular-nums">({entries.length})</span>
      </h3>
      {entries.length === 0 ? (
        <div className="flex flex-col items-start">
          <p className="text-sm text-muted-foreground">{empty}</p>
          {emptyAction}
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {shown.map((e) => (
            <li key={e.key} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3">
              <span className="break-words text-sm font-medium text-foreground">{e.name}</span>
              {e.detail && <span className="break-words text-xs text-muted-foreground">{e.detail}</span>}
            </li>
          ))}
          {more > 0 && (
            <li>
              <Link href={moreHref} className="text-xs font-medium text-primary underline-offset-4 hover:underline">
                {`+${more} more`}
              </Link>
            </li>
          )}
        </ul>
      )}
      {footer}
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
  assignAction,
  assignNote,
}: {
  id?: string
  projectId: string
  homeowners: ProjectHomeowners
  managerName: string | null
  members: { id: string; name: string; project_role: string | null }[]
  contacts: ProjectContact[] | null
  companies: ProjectCompanyContacts[]
  /** Text link to the assignment overlay, shown while no subcontractors are assigned; omitted when the viewer can't assign. */
  assignAction?: ReactNode
  /** Why assignment isn't available, shown to managers instead of the link. */
  assignNote?: string | null
}) {
  const peopleHref = `/projects/${projectId}/contacts`
  const homeownerEntries = unique(
    homeowners.groups.flatMap((g) =>
      g.contacts.length
        ? [...g.contacts]
            .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
            .map((c) => ({ key: c.id, name: c.name, detail: c.isPrimary ? 'Primary' : c.relationship || null }))
        : g.client
          ? [{ key: g.linkId, name: g.client.name, detail: g.linkRelationship || null }]
          : [],
    ),
  )
  const teamEntries = unique([
    ...(managerName ? [{ key: 'manager', name: managerName, detail: 'Project manager' }] : []),
    ...members.map((m) => ({ key: m.id, name: m.name, detail: m.project_role })),
  ])
  const outsideEntries = unique([
    ...companies.map((c) => ({ key: `co:${c.subcontractor_company_id}`, name: c.company_name, detail: 'Subcontractor company' })),
    ...(contacts ?? [])
      .filter((c) => c.status === 'active')
      .map((c) => ({ key: c.association_id, name: c.name, detail: [c.project_role, c.company_name].filter(Boolean).join(' · ') || null })),
  ])

  return (
    <section id={id} aria-labelledby="project-people-heading" className="surface flex min-w-0 scroll-mt-36 flex-col gap-3 p-4">
      <header className="flex items-center justify-between gap-3">
        <h2 id="project-people-heading" className="flex items-center gap-2 font-serif text-lg font-semibold text-foreground">
          <Users className="size-4 text-primary" aria-hidden="true" />
          People
        </h2>
        <Link
          href={peopleHref}
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Manage people
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </header>
      <div className="flex flex-col divide-y">
        <Group title="Homeowners" entries={homeownerEntries} empty="No homeowner linked" moreHref={peopleHref} />
        <Group title="Builder team" entries={teamEntries} empty="No team assigned" moreHref={peopleHref} />
        <Group
          title="Subcontractors & professionals"
          entries={outsideEntries}
          empty={contacts === null ? 'Directory contacts could not be loaded' : 'No subcontractors assigned'}
          emptyAction={assignAction}
          moreHref={peopleHref}
          footer={assignNote ? <p className="pt-1 text-xs text-muted-foreground">{assignNote}</p> : null}
        />
      </div>
    </section>
  )
}
