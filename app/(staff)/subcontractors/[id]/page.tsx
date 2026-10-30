import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, CheckCircle2, FolderKanban, History, Mail, Pencil, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'
import { PROJECT_STATUS_LABELS, projectAcceptsNewAssignments, type ProjectStatus } from '@/lib/domain'
import { isUuid, splitProjectAssignments, type ProjectAssignmentRecord } from '@/lib/subcontractor-projects'
import { companyInitials, projectCountLabel } from '@/lib/subcontractor-directory'
import { loadProjectAssignments, loadSubcontractor } from '@/lib/subcontractor-detail-data'
import { PageHeader, Surface } from '@/components/shared/page-header'
import { ProjectStatusBadge } from '@/components/shared/status-badge'
import { SubcontractorStatusButton } from '@/components/subcontractors/subcontractor-status-dialog'
import { SubcontractorStatusBadge } from '@/components/subcontractors/subcontractor-status-badge'
import { CompanyContacts } from '@/components/contacts/company-contacts'
import { loadCompanyProfile, loadPersonOptions } from '@/lib/contacts-data'

export const metadata: Metadata = { title: 'Subcontractor' }

export default async function SubcontractorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ saved?: string; projects?: string }>
}) {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'subcontractors')
  const { id } = await params
  const sp = await searchParams
  if (!isUuid(id)) notFound()

  const supabase = await createClient()
  const company = await loadSubcontractor(supabase, session.organizationId, id)
  if (!company) notFound()
  const [{ availability, records }, businessCompany, people] = await Promise.all([
    loadProjectAssignments(supabase, session.organizationId, id),
    loadCompanyProfile(supabase, session.organizationId, { subcontractorId: id }),
    loadPersonOptions(supabase, session.organizationId),
  ])
  const { current, history } = splitProjectAssignments(records, projectAcceptsNewAssignments)
  const addedProjects = Number.parseInt(sp.projects ?? '', 10)
  const editHref = `/subcontractors/${company.id}/edit`

  return (
    <div className="flex w-full max-w-5xl flex-col gap-5">
      <PageHeader
        backHref="/subcontractors"
        backLabel="Subcontractors"
        title={company.company_name}
        titleAddon={<SubcontractorStatusBadge status={company.status} />}
        description={company.trade}
        avatar={
          <span
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-semibold text-primary ring-1 ring-inset ring-[#174D32]/12 md:size-12 md:text-base"
          >
            {companyInitials(company.company_name)}
          </span>
        }
        actions={
          <>
            <SubcontractorStatusButton companyId={company.id} companyName={company.company_name} status={company.status} />
            <Button size="lg" render={<Link href={editHref} />} nativeButton={false}>
              <Pencil data-icon="inline-start" />
              Edit
            </Button>
          </>
        }
      />

      {sp.saved && (
        <p role="status" className="flex items-start gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Changes saved
          {addedProjects > 0 ? ` and ${addedProjects} ${addedProjects === 1 ? 'project was' : 'projects were'} added.` : '.'}
        </p>
      )}

      <Surface aria-labelledby="company-heading" className="gap-4">
        <h2 id="company-heading" className="font-serif text-lg font-semibold tracking-tight text-foreground">
          Company Information
        </h2>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-4 border-t pt-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoItem label="Trade">{company.trade}</InfoItem>
          <InfoItem label="Status">
            <SubcontractorStatusBadge status={company.status} />
          </InfoItem>
          <InfoItem label="Date Added">{formatDate(company.created_at)}</InfoItem>
          <InfoItem label="Email">
            {company.email ? (
              <a
                href={`mailto:${company.email}`}
                className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-primary underline-offset-4 hover:underline"
              >
                <Mail className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{company.email}</span>
              </a>
            ) : (
              <NotProvided />
            )}
          </InfoItem>
          <InfoItem label="Phone">
            {company.phone ? (
              <a
                href={`tel:${company.phone.replace(/[^0-9+]/g, '')}`}
                className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline"
              >
                <Phone className="size-3.5 shrink-0" aria-hidden="true" />
                {company.phone}
              </a>
            ) : (
              <NotProvided />
            )}
          </InfoItem>
        </dl>
      </Surface>

      <CompanyContacts
        target={{ subcontractorId: company.id }}
        contacts={businessCompany?.contacts ?? []}
        people={people}
        canEdit
        companyInactive={company.status === 'inactive'}
        subcontractor
      />

      <Surface aria-labelledby="projects-heading" className="gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id="projects-heading" className="font-serif text-lg font-semibold tracking-tight text-foreground">
              Project Assignments
            </h2>
            <p className="text-sm text-muted-foreground">Separate from schedule activity assignments.</p>
          </div>
          {availability === 'ready' && (
            <Button variant="outline" size="sm" render={<Link href={editHref} />} nativeButton={false}>
              <FolderKanban data-icon="inline-start" />
              Manage projects
            </Button>
          )}
        </div>

        {availability === 'setup-required' ? (
          <p className="flex items-start gap-2 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            Project assignments are not set up in this environment yet. Company details are unaffected.
          </p>
        ) : availability === 'error' ? (
          <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
            Projects could not be loaded. Refresh the page to try again.
          </p>
        ) : (
          <div className="flex flex-col gap-5 border-t pt-4">
            <AssignmentGroup
              headingId="current-projects-heading"
              title="Current Projects"
              count={projectCountLabel(current.length)}
              records={current}
              emptyText="Not assigned to any current project."
            />
            <AssignmentGroup
              headingId="project-history-heading"
              title="Project History"
              icon="history"
              count={`${history.length} ${history.length === 1 ? 'record' : 'records'}`}
              records={history}
              emptyText="No ended assignments or completed projects yet."
            />
          </div>
        )}
      </Surface>
    </div>
  )
}

function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm font-medium text-foreground">{children}</dd>
    </div>
  )
}

function NotProvided() {
  return <span className="font-normal text-muted-foreground">Not provided</span>
}

function AssignmentGroup({
  headingId,
  title,
  count,
  records,
  emptyText,
  icon = 'current',
}: {
  headingId: string
  title: string
  count: string
  records: ProjectAssignmentRecord[]
  emptyText: string
  icon?: 'current' | 'history'
}) {
  const Icon = icon === 'history' ? History : FolderKanban
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={headingId} className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon className="size-4 text-primary" aria-hidden="true" />
          {title}
        </h3>
        <span className="text-xs text-muted-foreground">{count}</span>
      </div>
      {records.length === 0 ? (
        <p className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {records.map((r) => (
            <AssignmentRow key={r.assignment_id} record={r} />
          ))}
        </ul>
      )}
    </section>
  )
}

function AssignmentRow({ record: r }: { record: ProjectAssignmentRecord }) {
  const status = r.project.status as ProjectStatus
  const knownStatus = status in PROJECT_STATUS_LABELS
  return (
    <li className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Link
          href={`/projects/${r.project.id}`}
          className="truncate text-sm font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
        >
          {r.project.name}
        </Link>
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span className="font-mono">{r.project.project_number}</span>
          <span aria-hidden="true">·</span>
          <span>
            {r.ended_at ? `${formatDate(r.associated_at)} – ${formatDate(r.ended_at)}` : `Since ${formatDate(r.associated_at)}`}
          </span>
          {r.end_reason && (
            <>
              <span aria-hidden="true">·</span>
              <span>{r.end_reason}</span>
            </>
          )}
        </span>
      </div>
      {knownStatus ? (
        <ProjectStatusBadge status={status} className="self-start sm:self-auto" />
      ) : (
        <span className="text-xs text-muted-foreground">{r.project.status}</span>
      )}
    </li>
  )
}
