import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertCircle, CheckCircle2, HardHat, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { loadDirectoryWork } from '@/lib/assignments-data'
import { AssignedWorkCard } from '@/components/subcontractors/assigned-work-card'
import { createClient } from '@/lib/supabase/server'
import { sanitizeSearch } from '@/lib/format'
import { PageHeader, EmptyState } from '@/components/shared/page-header'
import { SubcontractorTable } from '@/components/subcontractors/subcontractor-table'
import {
  SUBCONTRACTOR_COLUMNS,
  SUBCONTRACTOR_STATUS_LABELS,
  SUBCONTRACTOR_STATUSES,
  isMissingTableError,
  type SubcontractorCompany,
  type SubcontractorStatus,
} from '@/lib/subcontractors'
import { groupAssignedProjects } from '@/lib/subcontractor-projects'
import { summarizeDirectory } from '@/lib/subcontractor-directory'
import { DirectorySummary } from '@/components/subcontractors/directory-summary'
import { loadQualificationSummaries } from '@/lib/subcontractor-qualification-data'
import {
  QUALIFICATION_FILTERS,
  compareByQualification,
  matchesQualificationFilter,
  parseQualificationFilter,
  parseQualificationSort,
  type QualificationFilter,
} from '@/lib/subcontractor-qualification'
import { DirectoryToolbar } from '@/components/subcontractors/directory-toolbar'
import { loadPerformanceSummaries } from '@/lib/subcontractor-performance-data'
import { comparePerformance } from '@/lib/subcontractor-performance'

export const metadata: Metadata = { title: 'Subcontractors' }

const LIMIT = 500

export default async function SubcontractorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; added?: string; projects?: string; qualification?: string; sort?: string }>
}) {
  const session = await requireManager()
  const features = await requireFeature(session.organizationId, 'subcontractors')
  const params = await searchParams
  const q = sanitizeSearch(params.q)
  const status = SUBCONTRACTOR_STATUSES.includes(params.status as SubcontractorStatus)
    ? (params.status as SubcontractorStatus)
    : null
  const added = params.added?.slice(0, 160)
  const qualificationFilter = parseQualificationFilter(params.qualification)
  const sort = parseQualificationSort(params.sort)
  const filtered = Boolean(q || status || qualificationFilter)

  const supabase = await createClient()
  let query = supabase
    .from('subcontractor_companies')
    .select(SUBCONTRACTOR_COLUMNS)
    .eq('organization_id', session.organizationId)
    .order('company_name')
    .limit(LIMIT)
  if (status) query = query.eq('status', status)
  if (q) query = query.or(`company_name.ilike.*${q}*,trade.ilike.*${q}*,email.ilike.*${q}*,phone.ilike.*${q}*`)
  const [{ data, error }, work, assignmentsRes, qualification, performance] = await Promise.all([
    query,
    loadDirectoryWork(supabase, session.organizationId, features),
    supabase
      .from('subcontractor_project_assignments')
      .select('subcontractor_company_id, project:projects(id, name, project_number)')
      .eq('organization_id', session.organizationId)
      .is('ended_at', null)
      .limit(5000),
    loadQualificationSummaries(supabase, session.organizationId),
    loadPerformanceSummaries(supabase, session.organizationId),
  ])
  const qualificationReady = qualification.availability === 'ready'
  const performanceReady = performance.availability === 'ready'
  const loadedRows = (data ?? []) as SubcontractorCompany[]
  const filteredRows =
    qualificationFilter && qualificationReady
      ? loadedRows.filter((r) => matchesQualificationFilter(qualification.byCompany[r.id], qualificationFilter))
      : loadedRows
  const rows =
    sort === 'rating'
      ? performanceReady
        ? [...filteredRows].sort(
            (a, b) =>
              comparePerformance(performance.byCompany[a.id], performance.byCompany[b.id]) ||
              a.company_name.localeCompare(b.company_name),
          )
        : filteredRows
      : sort !== 'name' && qualificationReady
      ? [...filteredRows].sort(
          (a, b) =>
            compareByQualification(sort, qualification.byCompany[a.id], qualification.byCompany[b.id]) ||
            a.company_name.localeCompare(b.company_name),
        )
      : filteredRows
  const projectsByCompany = assignmentsRes.error
    ? null
    : groupAssignedProjects((assignmentsRes.data ?? []) as unknown as Parameters<typeof groupAssignedProjects>[0])
  // Metrics describe the whole directory, so reuse the unfiltered rows when we already have all of them.
  let summaryCompanies: { id: string; status: string }[] = loadedRows
  if (!error && (filtered || loadedRows.length === LIMIT)) {
    const all = await supabase
      .from('subcontractor_companies')
      .select('id, status')
      .eq('organization_id', session.organizationId)
      .limit(5000)
    summaryCompanies = all.error ? [] : (all.data ?? [])
  }
  const summary = summarizeDirectory(summaryCompanies, projectsByCompany)
  const addedProjects = Number.parseInt(params.projects ?? '', 10)
  const qualificationCounts = Object.fromEntries(
    QUALIFICATION_FILTERS.map((f) => [
      f,
      summaryCompanies.filter((c) => matchesQualificationFilter(qualification.byCompany[c.id], f)).length,
    ]),
  ) as Record<QualificationFilter, number>

  const addButton = (
    <Button size="lg" render={<Link href="/subcontractors/new" scroll={false} />} nativeButton={false}>
      <Plus data-icon="inline-start" />
      Add subcontractor
    </Button>
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={HardHat}
        title="Subcontractors"
        titleAddon={
          !error && summary.total > 0 ? (
            <span className="rounded-full bg-white px-2.5 py-0.5 text-sm font-medium tabular-nums text-muted-foreground ring-1 ring-inset ring-[#174D32]/12">
              <span className="sr-only">Total: </span>
              {summary.total}
            </span>
          ) : undefined
        }
        description="Trade partners, their qualification, and where they are working. Visible to administrators and project managers."
        actions={!error && addButton}
      />

      {added && !error && (
        <p role="status" className="flex items-start gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {added} was added to your subcontractors
          {addedProjects > 0 ? ` and assigned to ${addedProjects} ${addedProjects === 1 ? 'project' : 'projects'}.` : '.'}
        </p>
      )}

      {error ? (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="font-medium text-foreground">
              {isMissingTableError(error) ? 'Subcontractor storage is not set up yet' : 'Subcontractors could not be loaded'}
            </p>
            <p className="text-muted-foreground">
              {isMissingTableError(error)
                ? 'The subcontractor database migration has not been applied for this environment. No records were changed.'
                : 'Refresh the page to try again. If the problem continues, contact support.'}
            </p>
          </div>
        </div>
      ) : (
        <>
          {summary.total > 0 && (
            <DirectorySummary
              summary={summary}
              qualified={qualificationReady ? qualificationCounts.qualified : null}
              needsAttention={qualificationReady ? qualificationCounts.in_review + qualificationCounts.missing_items : null}
            />
          )}
          <DirectoryToolbar
            defaultQuery={q}
            defaultStatus={status ?? ''}
            statusOptions={SUBCONTRACTOR_STATUSES.map((s) => ({ value: s, label: SUBCONTRACTOR_STATUS_LABELS[s] }))}
            qualification={
              qualificationReady && summary.total > 0
                ? { active: qualificationFilter, sort, counts: qualificationCounts, total: summary.total }
                : null
            }
          />
          {rows.length ? (
            <div className="flex flex-col gap-2">
              {(filtered || loadedRows.length === LIMIT) && (
                <p className="text-sm text-muted-foreground" role="status">
                  {loadedRows.length === LIMIT
                    ? `Showing the first ${LIMIT} subcontractors. Narrow your search to find others.`
                    : `${rows.length} of ${summary.total} ${summary.total === 1 ? 'subcontractor' : 'subcontractors'} match`}
                </p>
              )}
              <SubcontractorTable
                rows={rows}
                projectsByCompany={projectsByCompany}
                qualificationByCompany={qualificationReady ? qualification.byCompany : null}
                performanceByCompany={performanceReady ? performance.byCompany : null}
              />
            </div>
          ) : null}
          {work.availability !== 'off' && <AssignedWorkCard availability={work.availability} items={work.items} />}
          {rows.length ? null : (
            <EmptyState
              icon={HardHat}
              title={filtered ? 'No matching subcontractors' : 'No subcontractors yet'}
              description={
                filtered
                  ? 'Try a different search, status, or qualification filter.'
                  : 'Add the trade partners you hire so your team has one place to find their details.'
              }
              action={
                filtered ? (
                  <Button variant="outline" render={<Link href="/subcontractors" />} nativeButton={false}>
                    Clear filters
                  </Button>
                ) : (
                  addButton
                )
              }
            />
          )}
        </>
      )}
    </div>
  )
}
