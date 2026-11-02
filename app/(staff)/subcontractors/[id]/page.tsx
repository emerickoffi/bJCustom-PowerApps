import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CardSectionHeader } from '@/components/shared/card-section-header'
import { AlertTriangle, Building2, CheckCircle2, FolderKanban, History, Mail, Pencil, Phone } from 'lucide-react'
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
import { loadQualificationDetail } from '@/lib/subcontractor-qualification-data'
import { todayIn } from '@/lib/subcontractor-qualification'
import { APP_TIME_ZONE } from '@/lib/format'
import { QualificationBadge } from '@/components/subcontractors/qualification-badge'
import { QualificationHistory, QualificationSection } from '@/components/subcontractors/qualification-section'
import { QualificationOverview } from '@/components/subcontractors/qualification-overview'
import { DetailTabs, detailTabHref, parseDetailTab } from '@/components/subcontractors/detail-tabs'
import { SubcontractorPortalAccess, type SubPortalAccountRow } from '@/components/subcontractor-work/portal-access'
import { loadPerformanceDetail } from '@/lib/subcontractor-performance-data'
import { getPeopleNames } from '@/lib/people'
import { PerformanceSection } from '@/components/subcontractors/performance-section'

export const metadata: Metadata = { title: 'Subcontractor' }

export default async function SubcontractorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ saved?: string; projects?: string; rate?: string; work?: string; tab?: string }>
}) {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'subcontractors')
  const { id } = await params
  const sp = await searchParams
  if (!isUuid(id)) notFound()

  const supabase = await createClient()
  const company = await loadSubcontractor(supabase, session.organizationId, id)
  if (!company) notFound()
  const [{ availability, records }, businessCompany, people, qualification, portalRes, performance] = await Promise.all([
    loadProjectAssignments(supabase, session.organizationId, id),
    loadCompanyProfile(supabase, session.organizationId, { subcontractorId: id }),
    loadPersonOptions(supabase, session.organizationId),
    loadQualificationDetail(supabase, session.organizationId, id),
    supabase
      .from('subcontractor_portal_accounts')
      .select('id, full_name, email, status')
      .eq('organization_id', session.organizationId)
      .eq('subcontractor_company_id', id)
      .order('status')
      .order('full_name'),
    loadPerformanceDetail(supabase, session.organizationId, id),
  ])
  const reviewerNames = await getPeopleNames(performance.reviews.map((r) => r.reviewed_by))
  const rateableAssignments = records.map((r) => ({
    assignmentId: r.assignment_id,
    projectId: r.project.id,
    projectName: r.project.name,
    projectNumber: r.project.project_number,
    associatedAt: r.associated_at,
    endedAt: r.ended_at,
  }))
  const initialRate =
    sp.rate && isUuid(sp.rate) ? { assignmentId: sp.rate, submissionId: sp.work && isUuid(sp.work) ? sp.work : null } : null
  const portalAccounts: SubPortalAccountRow[] | null = portalRes.error
    ? null
    : (portalRes.data ?? []).map((a) => ({
        id: a.id as string,
        name: a.full_name as string,
        email: a.email as string,
        status: a.status as 'active' | 'revoked',
      }))
  const { current, history } = splitProjectAssignments(records, projectAcceptsNewAssignments)
  const addedProjects = Number.parseInt(sp.projects ?? '', 10)
  const editHref = `/subcontractors/${company.id}/edit`
  // A rating deep link (?rate=) targets the Performance card, which lives on Overview.
  const tab = initialRate ? 'overview' : parseDetailTab(sp.tab)
  const contacts = businessCompany?.contacts ?? []
  const today = todayIn(APP_TIME_ZONE)
  const requestEvent = qualification.events.find((e) => e.event === 'documents_requested')
  const lastRequest = requestEvent ? { at: requestEvent.created_at, actor: requestEvent.actor_name } : null
  const qualificationHref = detailTabHref(company.id, 'qualification')

  return (
    <div className="flex w-full max-w-5xl flex-col gap-5">
      <PageHeader
        backHref="/subcontractors"
        backLabel="Subcontractors"
        title={company.company_name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {company.trade && <span className="font-medium text-foreground/80">{company.trade}</span>}
            {company.trade && (
              <span aria-hidden="true" className="hidden h-4 w-px bg-border sm:block" />
            )}
            <span className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Company:</span>
              <SubcontractorStatusBadge status={company.status} />
            </span>
            {qualification.availability === 'ready' && (
              <Link
                href={qualificationHref}
                scroll={false}
                aria-label="Qualification status, open Qualification tab"
                className="flex items-center gap-1.5 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span className="text-xs font-medium text-muted-foreground">Qualification:</span>
                <QualificationBadge summary={qualification.summary} />
              </Link>
            )}
          </span>
        }
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
              Edit company
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
        <CardSectionHeader id="company-heading" title="Company & Contacts" icon={Building2} />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-0">
        <section aria-labelledby="company-details-heading" className="flex min-w-0 flex-col gap-3 lg:pr-6">
        <h3 id="company-details-heading" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Company details
        </h3>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-1">
          <InfoItem label="Trade">{company.trade}</InfoItem>
          <InfoItem label="Date Added">{formatDate(company.created_at)}</InfoItem>
          <InfoItem label="Company email">
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
          <InfoItem label="Company phone">
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
        </section>
        <CompanyContacts
          target={{ subcontractorId: company.id }}
          contacts={contacts}
          people={people}
          canEdit
          companyInactive={company.status === 'inactive'}
          subcontractor
          heading="Contact people"
          previewLimit={3}
          variant="section"
          className="border-t border-border/60 pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6"
        />
        </div>
      </Surface>

      <DetailTabs companyId={company.id} active={tab} counts={{ projects: current.length }} />

      {tab === 'overview' && (
        <>
          <QualificationOverview
            companyId={company.id}
            companyName={company.company_name}
            companyActive={company.status === 'active'}
            availability={qualification.availability}
            summary={qualification.summary}
            items={qualification.items}
            lastUpdate={qualification.events[0]?.created_at ?? null}
            today={today}
            contacts={contacts}
            people={people}
            lastRequest={lastRequest}
            qualificationHref={qualificationHref}
          />

          <Surface aria-labelledby="projects-summary-heading" className="gap-4">
            <CardSectionHeader
              id="projects-summary-heading"
              title="Current Projects"
              icon={FolderKanban}
              action={
                <Link
                  href={detailTabHref(company.id, 'projects')}
                  scroll={false}
                  className="rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  View all projects
                </Link>
              }
            />
            {availability !== 'ready' ? (
              <p className="text-sm text-muted-foreground">Project assignments are not available right now.</p>
            ) : current.length === 0 ? (
              <p className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">Not assigned to any current project.</p>
            ) : (
              <ul className="flex flex-col divide-y rounded-lg border">
                {current.slice(0, 3).map((r) => (
                  <AssignmentRow key={r.assignment_id} record={r} />
                ))}
                {current.length > 3 && (
                  <li className="px-4 py-2.5 text-xs text-muted-foreground">{`and ${current.length - 3} more current projects`}</li>
                )}
              </ul>
            )}
          </Surface>

          {(availability === 'ready' ? performance.availability : availability) === 'ready' && (
            <PerformanceSection
              companyId={company.id}
              companyName={company.company_name}
              availability="ready"
              summary={performance.summary}
              reviews={performance.reviews}
              assignments={rateableAssignments}
              verifiedWork={performance.verifiedWork}
              reviewerNames={reviewerNames}
              initialRate={initialRate}
            />
          )}

          {portalAccounts && (
            <SubcontractorPortalAccess
              companyId={company.id}
              accounts={portalAccounts}
              canEdit
              companyInactive={company.status === 'inactive'}
            />
          )}
        </>
      )}

      {tab === 'qualification' && (
        <QualificationSection
          companyId={company.id}
          companyName={company.company_name}
          companyActive={company.status === 'active'}
          availability={qualification.availability}
          summary={qualification.summary}
          items={qualification.items}
          events={qualification.events}
          isAdmin={session.role === 'org_admin'}
          today={today}
          contacts={contacts}
          people={people}
          lastRequest={lastRequest}
        />
      )}

      {tab === 'history' && <QualificationHistory events={qualification.events} availability={qualification.availability} />}

      {tab === 'projects' && (
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
      )}
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
